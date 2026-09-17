import { CashMovementType, MembershipStatus, PaymentMethod, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { closeLocalCash, getLocalOpenCashFrontSession, getLocalOpenCashSession, listLocalCashHistory, moveLocalCash, openLocalCash, summarizeLocalCash } from "@/lib/local-cash";
import { findLocalCashFront, listLocalCashFronts } from "@/lib/local-cash-fronts";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { recordLocalAudit } from "@/lib/local-audit";
import { requestAuditMetadata } from "@/lib/audit";

const money = z.number().finite().min(0).max(9999999.99);
const openSchema = z.object({ action: z.literal("OPEN"), openingAmount: money, cashFrontId: z.string().min(1).optional() });
const moveSchema = z.object({ action: z.literal("MOVE"), type: z.enum(CashMovementType), amount: money.positive(), reason: z.string().trim().min(3).max(200), idempotencyKey: z.string().uuid() });
const countedSchema = z.object({ PIX: money, CREDIT_CARD: money, DEBIT_CARD: money, CASH: money, OTHER: money });
const closeSchema = z.object({ action: z.literal("CLOSE"), counted: countedSchema });
const actionSchema = z.discriminatedUnion("action", [openSchema, moveSchema, closeSchema]);

async function actor() {
  const session = await getCurrentSession(); if (!session) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

async function cashSummary(cashSessionId: string) {
  const session = await db.cashSession.findUnique({ where: { id: cashSessionId }, include: { movements: true, cashFront: true, sales: { where: { status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, include: { payments: true } }, refunds: { include: { payments: true } } } });
  if (!session) return null;
  const payments: Record<PaymentMethod, number> = { PIX: 0, CREDIT_CARD: 0, DEBIT_CARD: 0, CASH: 0, OTHER: 0 };
  for (const sale of session.sales) for (const payment of sale.payments) payments[payment.method] += Number(payment.amount);
  for (const refund of session.refunds) for (const payment of refund.payments) payments[payment.method] -= Number(payment.amount);
  const supplies = session.movements.filter(movement => movement.type === "SUPPLY").reduce((sum, movement) => sum + Number(movement.amount), 0);
  const withdrawals = session.movements.filter(movement => movement.type === "WITHDRAWAL").reduce((sum, movement) => sum + Number(movement.amount), 0);
  const expected = { ...payments, CASH: Number(session.openingAmount) + payments.CASH + supplies - withdrawals };
  return { id: session.id, status: session.status, openingAmount: Number(session.openingAmount), openedAt: session.openedAt, closedAt: session.closedAt, cashFrontId: session.cashFrontId, cashFrontName: session.cashFront?.name ?? null, expected, expectedTotal: Object.values(expected).reduce((sum, amount) => sum + amount, 0), supplies, withdrawals, movements: session.movements.map(movement => ({ id: movement.id, type: movement.type, amount: Number(movement.amount), reason: movement.reason, createdAt: movement.createdAt })), closingAmount: session.closingAmount === null ? null : Number(session.closingAmount), differenceAmount: session.differenceAmount === null ? null : Number(session.differenceAmount), closingBreakdown: session.closingBreakdown };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const open = getLocalOpenCashSession(session.establishment.id, session.user.id);
    const frontName = (cashFrontId: string | null) => cashFrontId ? findLocalCashFront(session.establishment.id, cashFrontId)?.name ?? null : null;
    const history = listLocalCashHistory(session.establishment.id).map(item => ({ ...item, cashFrontName: frontName(item.cashFrontId) }));
    return Response.json({ cash: open ? { ...summarizeLocalCash(open), cashFrontName: frontName(open.cashFrontId) } : null, history, fronts: listLocalCashFronts(session.establishment.id).filter(item => item.active) });
  }
  const session = await actor(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const open = await db.cashSession.findFirst({ where: { establishmentId: session.establishment.id, openedById: session.user.id, status: "OPEN" } });
  const history = session.canViewCashHistory ? await db.cashSession.findMany({ where: { establishmentId: session.establishment.id }, orderBy: { openedAt: "desc" }, take: 10, select: { id: true } }) : [];
  const fronts = await db.cashFront.findMany({ where: { establishmentId: session.establishment.id, active: true }, orderBy: { name: "asc" } });
  return Response.json({ cash: open ? await cashSummary(open.id) : null, history: (await Promise.all(history.map(item => cashSummary(item.id)))).filter(Boolean), fronts });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Dados de caixa inválidos." }, { status: 400 });
  const data = parsed.data;
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const localBase = { organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request) };
    if (data.action === "OPEN") {
      if (!session.canOpenCash) return Response.json({ error: "Acesso negado." }, { status: 403 });
      if (data.cashFrontId) {
        if (!findLocalCashFront(session.establishment.id, data.cashFrontId)) return Response.json({ error: "Frente de caixa não encontrada." }, { status: 400 });
        if (getLocalOpenCashFrontSession(session.establishment.id, data.cashFrontId)) return Response.json({ error: "Essa frente de caixa já está aberta com outro operador." }, { status: 409 });
      }
      const cash = openLocalCash(session.establishment.id, session.user.id, data.openingAmount, data.cashFrontId ?? null);
      if (cash) recordLocalAudit({ ...localBase, action: "CASH_OPEN", entityType: "CashSession", entityId: cash.id, reason: "Abertura de caixa", after: { openingAmount: data.openingAmount, cashFrontId: data.cashFrontId ?? null } });
      return cash ? Response.json({ cash: { ...summarizeLocalCash(cash), cashFrontName: cash.cashFrontId ? findLocalCashFront(session.establishment.id, cash.cashFrontId)?.name ?? null : null } }, { status: 201 }) : Response.json({ error: "Já existe um caixa aberto para este operador nesta unidade." }, { status: 409 });
    }
    if (data.action === "MOVE") { if (!session.canMoveCash) return Response.json({ error: "Acesso negado." }, { status: 403 }); const result = moveLocalCash(session.establishment.id, session.user.id, data); if (result === "NO_OPEN_CASH") return Response.json({ error: "Abra o caixa antes de movimentá-lo." }, { status: 409 }); if (result === "INSUFFICIENT_CASH") return Response.json({ error: "Dinheiro insuficiente para esta sangria." }, { status: 409 }); if (result === "DUPLICATE") return Response.json({ error: "Movimentação já registrada." }, { status: 409 }); const movement = result.movements.at(-1)!; recordLocalAudit({ ...localBase, action: "CASH_MOVEMENT", entityType: "CashMovement", entityId: movement.id, reason: data.reason, after: { type: data.type, amount: data.amount, cashSessionId: result.id } }); return Response.json({ cash: summarizeLocalCash(result) }, { status: 201 }); }
    if (!session.canCloseCash) return Response.json({ error: "Acesso negado." }, { status: 403 }); const open = getLocalOpenCashSession(session.establishment.id, session.user.id); const closed = closeLocalCash(session.establishment.id, session.user.id, data.counted); if (closed && open) recordLocalAudit({ ...localBase, action: "CASH_CLOSE", entityType: "CashSession", entityId: closed.id, reason: "Fechamento e conferência", before: { status: "OPEN" }, after: { status: "CLOSED", expected: closed.expectedTotal, counted: closed.closingAmount, difference: closed.differenceAmount, breakdown: data.counted } }); return closed ? Response.json({ cash: closed }) : Response.json({ error: "Não existe caixa aberto." }, { status: 409 });
  }
  const session = await actor(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  try {
    if (data.action === "OPEN") {
      if (!session.canOpenCash) return Response.json({ error: "Acesso negado." }, { status: 403 });
      if (data.cashFrontId) {
        const front = await db.cashFront.findFirst({ where: { id: data.cashFrontId, establishmentId: session.establishment.id, active: true } });
        if (!front) return Response.json({ error: "Frente de caixa não encontrada." }, { status: 400 });
        const frontOpen = await db.cashSession.findFirst({ where: { cashFrontId: data.cashFrontId, status: "OPEN" } });
        if (frontOpen) return Response.json({ error: "Essa frente de caixa já está aberta com outro operador." }, { status: 409 });
      }
      const cash = await db.$transaction(async tx => { const created = await tx.cashSession.create({ data: { establishmentId: session.establishment.id, openedById: session.user.id, cashFrontId: data.cashFrontId, openingAmount: data.openingAmount } }); await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "CASH_OPEN", entityType: "CashSession", entityId: created.id, reason: "Abertura de caixa", after: { openingAmount: data.openingAmount, cashFrontId: data.cashFrontId ?? null }, ...requestAuditMetadata(request) } }); return created; });
      return Response.json({ cash: await cashSummary(cash.id) }, { status: 201 });
    }
    const open = await db.cashSession.findFirst({ where: { establishmentId: session.establishment.id, openedById: session.user.id, status: "OPEN" } }); if (!open) return Response.json({ error: "Não existe caixa aberto para este operador nesta unidade." }, { status: 409 });
    if (data.action === "MOVE") {
      if (!session.canMoveCash) return Response.json({ error: "Acesso negado." }, { status: 403 });
      if (data.type === "WITHDRAWAL") { const summary = await cashSummary(open.id); if (summary && data.amount > summary.expected.CASH) return Response.json({ error: "Dinheiro insuficiente para esta sangria." }, { status: 409 }); }
      await db.$transaction(async tx => { const movement = await tx.cashMovement.create({ data: { cashSessionId: open.id, actorId: session.user.id, type: data.type, amount: data.amount, reason: data.reason, idempotencyKey: data.idempotencyKey } }); await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "CASH_MOVEMENT", entityType: "CashMovement", entityId: movement.id, reason: data.reason, after: { type: data.type, amount: data.amount, cashSessionId: open.id }, ...requestAuditMetadata(request) } }); });
      return Response.json({ cash: await cashSummary(open.id) }, { status: 201 });
    }
    if (!session.canCloseCash) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const summary = await cashSummary(open.id); if (!summary) return Response.json({ error: "Caixa não encontrado." }, { status: 404 });
    const closingAmount = Object.values(data.counted).reduce((sum, amount) => sum + amount, 0); const differenceAmount = closingAmount - summary.expectedTotal;
    await db.$transaction(async tx => { await tx.cashSession.update({ where: { id: open.id }, data: { status: "CLOSED", closedAt: new Date(), closingAmount, expectedClosingAmount: summary.expectedTotal, differenceAmount, closingBreakdown: data.counted } }); await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "CASH_CLOSE", entityType: "CashSession", entityId: open.id, reason: "Fechamento e conferência", before: { status: "OPEN" }, after: { status: "CLOSED", expected: summary.expectedTotal, counted: closingAmount, difference: differenceAmount, breakdown: data.counted }, ...requestAuditMetadata(request) } }); });
    return Response.json({ cash: await cashSummary(open.id) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (data.action !== "OPEN") return Response.json({ error: "Movimentação já registrada." }, { status: 409 });
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : "";
      return Response.json({ error: target.includes("cashFrontId") ? "Essa frente de caixa já está aberta com outro operador." : "Já existe um caixa aberto para este operador nesta unidade." }, { status: 409 });
    }
    return Response.json({ error: "Não foi possível atualizar o caixa." }, { status: 500 });
  }
}
