import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { addToDelivery, deliveryAdditionSchema, DeliveryAdditionError } from "@/lib/delivery-additions";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const session = await getCurrentSession();
  if (!session || (!session.canOperateDelivery && !session.canOperateFloor)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const input = deliveryAdditionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Confira os itens e a quantidade." }, { status: 400 });
  const order = await db.deliveryOrder.findFirst({ where: { id: input.data.orderId, establishmentId: session.establishment.id } });
  const kitchen = order?.kitchenOrderId ? await db.order.findFirst({ where: { id: order.kitchenOrderId }, include: { tab: { include: { table: true } } } }) : null;
  if (!kitchen || (kitchen.tab.table.isCounter ? !session.canOperateDelivery : !session.canOperateFloor || (!session.canManageFloor && kitchen.tab.table.assignedWaiterId && kitchen.tab.table.assignedWaiterId !== session.user.id))) return Response.json({ error: "Acesso negado ao pedido." }, { status: 403 });
  try {
    return Response.json(await addToDelivery(db, { establishmentId: session.establishment.id, organizationId: session.organization.id, userId: session.user.id, canOperateFloor: session.canOperateFloor, canOperateDelivery: session.canOperateDelivery, canManageFloor: session.canManageFloor }, input.data));
  } catch (error) {
    return Response.json({ error: error instanceof DeliveryAdditionError ? error.message : "Não foi possível acrescentar. Atualize o pedido e tente novamente." }, { status: 409 });
  }
}
