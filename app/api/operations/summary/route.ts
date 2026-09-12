import { MembershipStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalAudit } from "@/lib/local-audit";
import { getLocalFloor } from "@/lib/local-floor";

async function actor() {
  const session = await getCurrentSession();
  if (!session) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const since = startOfToday();
    const events = listLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, action: "SALE_COMPLETE", limit: 500 })
      .filter(event => new Date(event.createdAt) >= since);
    const cancelled = new Set(
      listLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, action: "SALE_CANCEL", limit: 500 })
        .map(event => event.entityId),
    );
    const completed = events.filter(event => !cancelled.has(event.entityId));
    const refundedBySale = new Map<string, number>();
    for (const event of listLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, action: "SALE_REFUND", limit: 500 })) { const after = event.after as { amount?: number } | undefined; refundedBySale.set(event.entityId, (refundedBySale.get(event.entityId) ?? 0) + (after?.amount ?? 0)); }
    const sales = completed.map(event => {
      const after = event.after as { channel?: string; table?: number; payment?: string; payments?: { method: string }[]; total?: number; items?: { productName: string; quantity: number; unitPrice?: number }[] } | undefined;
      const total = after?.total ?? 0; const refunded = refundedBySale.get(event.entityId) ?? 0;
      return { id: event.entityId, channel: after?.channel ?? "POS", table: after?.table ?? null, payment: after?.payments?.map(item => item.method).join(" + ") ?? after?.payment ?? "", total, refunded, status: refunded >= total && total > 0 ? "REFUNDED" : refunded > 0 ? "PARTIALLY_REFUNDED" : "COMPLETED", completedAt: event.createdAt, items: after?.items ?? [] };
    });
    const revenueToday = sales.reduce((sum, sale) => sum + sale.total - sale.refunded, 0);
    const ranking = new Map<string, number>();
    for (const sale of sales) for (const item of sale.items) ranking.set(item.productName, (ranking.get(item.productName) ?? 0) + item.quantity);
    const floor = getLocalFloor(session.establishment.id);
    return Response.json({
      revenueToday,
      salesCountToday: sales.length,
      averageTicket: sales.length ? revenueToday / sales.length : 0,
      ongoingOrders: floor.orders.length,
      recentSales: sales.slice(-10).reverse().map(sale => ({ id: sale.id, channel: sale.channel, table: sale.table, payment: sale.payment, total: sale.total, refunded: sale.refunded, status: sale.status, completedAt: sale.completedAt, items: sale.items.map(item => ({ productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice ?? 0 })) })),
      ranking: [...ranking.entries()].map(([productName, quantity]) => ({ productName, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 3),
    });
  }

  const session = await actor();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const since = startOfToday();

  const [sales, ongoingOrders] = await Promise.all([
    db.sale.findMany({
      where: { organizationId: session.organization.id, establishmentId: session.establishment.id, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] }, completedAt: { gte: since } },
      include: { items: true, payments: true, refunds: true, tab: { include: { table: true } } },
      orderBy: { completedAt: "desc" },
    }),
    db.order.count({ where: { tab: { establishmentId: session.establishment.id }, status: { notIn: ["DELIVERED", "CANCELLED"] } } }),
  ]);

  const revenueToday = sales.reduce((sum, sale) => sum + Number(sale.total) - sale.refunds.reduce((refundSum, refund) => refundSum + Number(refund.amount), 0), 0);
  const ranking = new Map<string, number>();
  for (const sale of sales) for (const item of sale.items) ranking.set(item.productName, (ranking.get(item.productName) ?? 0) + Number(item.quantity));

  return Response.json({
    revenueToday,
    salesCountToday: sales.length,
    averageTicket: sales.length ? revenueToday / sales.length : 0,
    ongoingOrders,
    recentSales: sales.slice(0, 10).map(sale => ({ id: sale.id, channel: sale.channel, table: sale.tab?.table.number ?? null, payment: sale.payments.map(payment => payment.method).join(" + "), total: Number(sale.total), refunded: sale.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0), status: sale.status, completedAt: sale.completedAt, items: sale.items.map(item => ({ productName: item.productName, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })) })),
    ranking: [...ranking.entries()].map(([productName, quantity]) => ({ productName, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 3),
  });
}
