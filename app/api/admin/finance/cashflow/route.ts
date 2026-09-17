import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { computeLocalCashFlow } from "@/lib/local-finance";
import { summarizeCashFlow, defaultMonthRange, type CashFlowItem } from "@/lib/cashflow";

const querySchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canViewFinanceCashflow) return null;
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
  const parsed = querySchema.safeParse({ from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  if (!parsed.success) return Response.json({ error: "Período inválido." }, { status: 400 });
  const { fromDate, toDate } = resolveRange(parsed.data.from, parsed.data.to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return Response.json({ error: "Período inválido." }, { status: 400 });
  }

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canViewFinanceCashflow) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const result = computeLocalCashFlow(session.organization.id, session.establishment.id, fromDate.toISOString(), toDate.toISOString());
    return Response.json({ ...result, from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const [entries, sales, movements, bankAccounts] = await Promise.all([
    db.financialEntry.findMany({
      where: { establishmentId: actor.establishment.id, status: "PAID", paidAt: { gte: fromDate, lte: toDate } },
      include: { category: true },
    }),
    db.sale.findMany({
      where: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] }, completedAt: { gte: fromDate, lte: toDate } },
      include: { refunds: true },
    }),
    db.cashMovement.findMany({
      where: { cashSession: { establishmentId: actor.establishment.id }, type: { in: ["WITHDRAWAL", "SUPPLY"] }, createdAt: { gte: fromDate, lte: toDate } },
    }),
    db.bankAccount.findMany({ where: { establishmentId: actor.establishment.id } }),
  ]);

  const items: CashFlowItem[] = [];
  for (const entry of entries) {
    items.push({ id: entry.id, date: (entry.paidAt ?? entry.dueDate).toISOString(), description: entry.description, type: entry.category.kind === "INCOME" ? "IN" : "OUT", amount: Number(entry.amount), source: "ENTRY" });
  }
  for (const sale of sales) {
    const refunded = sale.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
    const netAmount = Number(sale.total) - refunded;
    if (netAmount <= 0) continue;
    items.push({ id: sale.id, date: sale.completedAt.toISOString(), description: `Venda ${sale.channel}`, type: "IN", amount: netAmount, source: "SALE" });
  }
  for (const movement of movements) {
    items.push({ id: movement.id, date: movement.createdAt.toISOString(), description: movement.reason, type: movement.type === "SUPPLY" ? "IN" : "OUT", amount: Number(movement.amount), source: "CASH_MOVEMENT" });
  }

  const openingBalance = bankAccounts.reduce((sum, account) => sum + Number(account.initialBalance), 0);
  const summary = summarizeCashFlow(items);
  return Response.json({ ...summary, openingBalance, accumulatedBalance: openingBalance + summary.balance, from: fromDate.toISOString(), to: toDate.toISOString() });
}
