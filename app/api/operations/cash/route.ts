import { CashMovementType, MembershipStatus, PaymentMethod, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { closeLocalCash, getLocalOpenCashSession, listLocalCashHistory, moveLocalCash, openLocalCash, summarizeLocalCash } from "@/lib/local-cash";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { recordLocalAudit } from "@/lib/local-audit";
import { requestAuditMetadata } from "@/lib/audit";

const money = z.number().finite().min(0).max(9999999.99);
const openSchema = z.object({ action: z.literal("OPEN"), openingAmount: money });
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
  const session = await db.cashSession.findUnique({ where: { id: cashSessionId }, include: { movements: true, sales: { where: { status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, include: { payments: true } }, refunds: { include: { payments: true } } } });
  if (!session) return null;
  const payments: Record<PaymentMethod, number> = { PIX: 0, CREDIT_CARD: 0, DEBIT_CARD: 0, CASH: 0, OTHER: 0 };
  for (const sale of session.sales) for (const payment of sale.payments) payments[payment.method] += Number(payment.amount);
  for (const refund of session.refunds) for (const payment of refund.payments) payments[payment.method] -= Number(payment.amount);
  const supplies = session.movements.filter(movement => movement.type === "SUPPLY").reduce((sum, movement) => sum + Number(movement.amount), 0);
  const withdrawals = session.movements.filter(movement => movement.type === "WITHDRAWAL").reduce((sum, movement) => sum + Number(movement.amount), 0);
  const expected = { ...payments, CASH: Number(session.openingAmount) + payments.CASH + supplies - withdrawals };
  return { id: session.id, status: session.status, openingAmount: Number(session.openingAmount), openedAt: session.openedAt, closedAt: session.closedAt, expected, expectedTotal: Object.values(expected).reduce((sum, amount) => sum + amount, 0), supplies, withdrawals, movements: session.movements.map(movement => ({ id: movement.id, type: movement.type, amount: Number(movement.amount), reason: movement.reason, createdAt: movement.createdAt })), closingAmount: session.closingAmount === null ? null : Number(session.closingAmount), differenceAmount: session.differenceAmount === null ? null : Number(session.differenceAmount), closingBreakdown: session.closingBreakdown };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const open = getLocalOpenCashSession(session.establishment.id, session.user.id);
    return Response.json({ cash: open ? summarizeLocalCash(open) : null, history: listLocalCashHistory(session.establishment.id) });
  }
  const session = await actor(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const open = await db.cashSession.findFirst({ where: { establishmentId: session.establishment.id, openedById: session.user.id, status: "OPEN" } });
  const history = session.canViewCashHistory ? await db.cashSession.findMany({ where: { establishmentId: session.establishment.id }, orderBy: { openedAt: "desc" }, take: 10, select: { id: true } }) : [];
  return Response.json({ cash: open ? await cashSummary(open.id) : null, history: (await Promise.all(history.map(item => cashSummary(item.id)))).filter(Boolean) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Dados de caixa inválidos." }, { status: 400 });
  const data = parsed.data;
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const localBase = { organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request) };
    if (data.action === "OPEN") { if (!session.canOpenCash) return Response.json({ error: "Acesso negado." }, { status: 403 }); const cash = openLocalCash(session.establishment.id, session.user.id, data.openingAmount); if (cash) recordLocalAudit({ ...localBase, action: "CASH_OPEN", entityType: "CashSession", entityId: cash.id, reason: "Abertura de caixa", after: { openingAmount: data.openingAmount } }); return cash ? Response.json({ cash: summarizeLocalCash(cash) }, { status: 201 }) : Response.json({ error: "Já existe um caixa aberto para este operador nesta unidade." }, { status: 409 }); }
    if (data.action === "MOVE") { if (!session.canMoveCash) return Response.json({ error: "Acesso negado." }, { status: 403 }); const result = moveLocalCash(session.establishment.id, session.user.id, data); if (result === "NO_OPEN_CASH") return Response.json({ error: "Abra o caixa antes de movimentá-lo." }, { status: 409 }); if (result === "INSUFFICIENT_CASH") return Response.json({ error: "Dinheiro insuficiente para esta sangria." }, { status: 409 }); if (result === "DUPLICATE") return Response.json({ error: "Movimentação já registrada." }, { status: 409 }); const movement = result.movements.at(-1)!; recordLocalAudit({ ...localBase, action: "CASH_MOVEMENT", entityType: "CashMovement", entityId: movement.id, reason: data.reason, after: { type: data.type, amount: data.amount, cashSessionId: result.id } }); return Response.json({ cash: summarizeLocalCash(result) }, { status: 201 }); }
    if (!session.canCloseCash) return Response.json({ error: "Acesso negado." }, { status: 403 }); const open = getLocalOpenCashSession(session.establishment.id, session.user.id); const closed = closeLocalCash(session.establishment.id, session.user.id, data.counted); if (closed && open) recordLocalAudit({ ...localBase, action: "CASH_CLOSE", entityType: "CashSession", entityId: closed.id, reason: "Fechamento e conferência", before: { status: "OPEN" }, after: { status: "CLOSED", expected: closed.expectedTotal, counted: closed.closingAmount, difference: closed.differenceAmount, breakdown: data.counted } }); return closed ? Response.json({ cash: closed }) : Response.json({ error: "Não existe caixa aberto." }, { status: 409 });
  }
  const session = await actor(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  try {
    if (data.action === "OPEN") {
      if (!session.canOpenCash) return Response.json({ error: "Acesso negado." }, { status: 403 });
      const cash = await db.$transaction(async tx => { const created = await tx.cashSession.create({ data: { establishmentId: session.establishment.id, openedById: session.user.id, openingAmount: data.openingAmount } }); await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "CASH_OPEN", entityType: "CashSession", entityId: created.id, reason: "Abertura de caixa", after: { openingAmount: data.openingAmount }, ...requestAuditMetadata(request) } }); return created; });
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: data.action === "OPEN" ? "Já existe um caixa aberto para este operador nesta unidade." : "Movimentação já registrada." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar o caixa." }, { status: 500 });
  }
}
