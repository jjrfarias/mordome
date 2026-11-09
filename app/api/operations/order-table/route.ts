import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { linkOrderTable, OrderTableError } from "@/lib/order-table";
import { z } from "zod";

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const session = await getCurrentSession();
  if (!session?.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 });
  const orders = await db.deliveryOrder.findMany({ where: { establishmentId: session.establishment.id, saleId: null, origin: { not: "IFOOD" }, status: { in: ["RECEIVED", "PREPARING"] } }, orderBy: { createdAt: "desc" }, take: 100, include: { items: true } });
  const kitchens = await db.order.findMany({ where: { id: { in: orders.flatMap(o => o.kitchenOrderId ? [o.kitchenOrderId] : []) }, tab: { establishmentId: session.establishment.id, status: "OPEN", table: { isCounter: true } } }, select: { id: true } });
  const eligible = new Set(kitchens.map(o => o.id));
  return Response.json({ orders: orders.filter(o => eligible.has(o.kitchenOrderId ?? "")).map(o => ({ id: o.id, customerName: o.customerName, customerPhone: o.customerPhone, total: o.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0) })) });
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const session = await getCurrentSession();
  if (!session?.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 });
  const parsed = z.object({ orderId: z.string().min(1), tableId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Selecione o pedido e a mesa." }, { status: 400 });
  try { return Response.json(await linkOrderTable(db, { establishmentId: session.establishment.id, organizationId: session.organization.id, userId: session.user.id, canManageFloor: session.canManageFloor }, parsed.data)); }
  catch (error) { return Response.json({ error: error instanceof OrderTableError ? error.message : "O pedido mudou durante a operação. Atualize e tente novamente." }, { status: 409 }); }
}
