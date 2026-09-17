import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { computeLocalSettlementCandidates, createLocalSettlementRecord, listLocalSettlementRecords } from "@/lib/local-settlements";
import { calculateCommission, type SettlementRole } from "@/lib/settlements";
import { defaultMonthRange } from "@/lib/cashflow";

const roleSchema = z.enum(["COURIER", "WAITER"]);

const querySchema = z.object({
  role: roleSchema,
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
});

const createSchema = z.object({
  userId: z.string().min(1),
  role: roleSchema,
  from: z.string().min(1),
  to: z.string().min(1),
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageSettlements) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

function resolveRange(from?: string, to?: string) {
  if (!from || !to) {
    const { from: defaultFrom, to: defaultTo } = defaultMonthRange();
    return { fromDate: defaultFrom, toDate: defaultTo };
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setUTCHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ role: url.searchParams.get("role"), from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  if (!parsed.success) return Response.json({ error: "Parâmetros inválidos." }, { status: 400 });
  const { fromDate, toDate } = resolveRange(parsed.data.from, parsed.data.to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return Response.json({ error: "Período inválido." }, { status: 400 });
  }
  const role = parsed.data.role as SettlementRole;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageSettlements) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const candidates = computeLocalSettlementCandidates(session.establishment.id, role, fromDate.toISOString(), toDate.toISOString());
    const history = listLocalSettlementRecords(session.establishment.id, role);
    return Response.json({ candidates, history, from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const rules = await db.userCommissionRule.findMany({ where: { establishmentId: actor.establishment.id, role } });
  const usageByUser = new Map<string, { deliveryCount: number; salesTotal: number }>();

  if (role === "COURIER") {
    const deliveries = await db.deliveryOrder.findMany({ where: { establishmentId: actor.establishment.id, status: "DELIVERED", courierId: { not: null }, updatedAt: { gte: fromDate, lte: toDate } }, select: { courierId: true } });
    for (const delivery of deliveries) {
      if (!delivery.courierId) continue;
      const usage = usageByUser.get(delivery.courierId) ?? { deliveryCount: 0, salesTotal: 0 };
      usage.deliveryCount += 1;
      usageByUser.set(delivery.courierId, usage);
    }
  } else {
    const sales = await db.sale.findMany({ where: { establishmentId: actor.establishment.id, channel: "FLOOR", status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] }, completedAt: { gte: fromDate, lte: toDate } }, include: { refunds: true } });
    for (const sale of sales) {
      const refunded = sale.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
      const netAmount = Number(sale.total) - refunded;
      if (netAmount <= 0) continue;
      const usage = usageByUser.get(sale.operatorId) ?? { deliveryCount: 0, salesTotal: 0 };
      usage.salesTotal += netAmount;
      usageByUser.set(sale.operatorId, usage);
    }
  }

  const userIds = [...usageByUser.keys()];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(users.map(user => [user.id, user.name]));

  const candidates = userIds.map(userId => {
    const usage = usageByUser.get(userId)!;
    const rule = rules.find(item => item.userId === userId) ?? null;
    return {
      userId,
      userName: nameById.get(userId) ?? userId,
      role,
      deliveryCount: usage.deliveryCount,
      salesTotal: usage.salesTotal,
      hasRule: Boolean(rule),
      amount: calculateCommission(rule ? { amountPerDelivery: rule.amountPerDelivery ? Number(rule.amountPerDelivery) : null, percentOfSales: rule.percentOfSales ? Number(rule.percentOfSales) : null } : null, usage),
    };
  });

  const history = await db.settlementRecord.findMany({ where: { establishmentId: actor.establishment.id, role }, include: { user: { select: { name: true } } }, orderBy: { paidAt: "desc" } });

  return Response.json({ candidates, history, from: fromDate.toISOString(), to: toDate.toISOString() });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;
  const fromDate = new Date(data.from);
  const toDate = new Date(data.to);
  toDate.setUTCHours(23, 59, 59, 999);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) return Response.json({ error: "Período inválido." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageSettlements) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const candidates = computeLocalSettlementCandidates(session.establishment.id, data.role as SettlementRole, fromDate.toISOString(), toDate.toISOString());
    const candidate = candidates.find(item => item.userId === data.userId);
    const amount = candidate?.amount ?? 0;
    const created = createLocalSettlementRecord(session.establishment.id, { userId: data.userId, role: data.role as SettlementRole, from: fromDate.toISOString(), to: toDate.toISOString(), amount, createdById: session.user.id });
    if (created === "DUPLICATE") return Response.json({ error: "Já existe um acerto registrado para este usuário e período." }, { status: 409 });
    return Response.json({ settlement: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const rule = await db.userCommissionRule.findFirst({ where: { establishmentId: actor.establishment.id, userId: data.userId, role: data.role } });
  let amount = 0;
  if (data.role === "COURIER") {
    const count = await db.deliveryOrder.count({ where: { establishmentId: actor.establishment.id, status: "DELIVERED", courierId: data.userId, updatedAt: { gte: fromDate, lte: toDate } } });
    amount = calculateCommission(rule ? { amountPerDelivery: rule.amountPerDelivery ? Number(rule.amountPerDelivery) : null, percentOfSales: rule.percentOfSales ? Number(rule.percentOfSales) : null } : null, { deliveryCount: count, salesTotal: 0 });
  } else {
    const sales = await db.sale.findMany({ where: { establishmentId: actor.establishment.id, channel: "FLOOR", operatorId: data.userId, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] }, completedAt: { gte: fromDate, lte: toDate } }, include: { refunds: true } });
    const salesTotal = sales.reduce((sum, sale) => {
      const refunded = sale.refunds.reduce((refundSum, refund) => refundSum + Number(refund.amount), 0);
      const netAmount = Number(sale.total) - refunded;
      return sum + (netAmount > 0 ? netAmount : 0);
    }, 0);
    amount = calculateCommission(rule ? { amountPerDelivery: rule.amountPerDelivery ? Number(rule.amountPerDelivery) : null, percentOfSales: rule.percentOfSales ? Number(rule.percentOfSales) : null } : null, { deliveryCount: 0, salesTotal });
  }

  try {
    const settlement = await db.settlementRecord.create({ data: { establishmentId: actor.establishment.id, userId: data.userId, role: data.role, from: fromDate, to: toDate, amount, createdById: actor.user.id } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "SettlementRecord", entityId: settlement.id, reason: `Acerto de ${data.role === "COURIER" ? "entregador" : "garçom"} registrado`, after: { userId: data.userId, role: data.role, from: fromDate, to: toDate, amount } } });
    return Response.json({ settlement }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um acerto registrado para este usuário e período." }, { status: 409 });
    return Response.json({ error: "Não foi possível registrar o acerto." }, { status: 500 });
  }
}
