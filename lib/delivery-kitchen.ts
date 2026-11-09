import type { Prisma } from "../generated/prisma/client.ts";
import type { KitchenStage } from "./delivery-workflow.ts";

export async function linkedKitchen(tx: Prisma.TransactionClient, establishmentId: string, kitchenOrderId: string | null) {
  const order = kitchenOrderId ? await tx.order.findFirst({ where: { id: kitchenOrderId, tab: { establishmentId, table: { isCounter: true } } } }) : null;
  if (!order) return null;
  const siblings = await tx.order.findMany({ where: { deliveryParent: { kitchenOrderId: order.id, establishmentId } }, select: { status: true } });
  const stages = [order.status, ...siblings.map(item => item.status)];
  const status = stages.includes("CANCELLED") ? "CANCELLED" : stages.includes("RECEIVED") ? "RECEIVED" : stages.includes("PREPARING") ? "PREPARING" : stages.includes("READY") ? "READY" : "DELIVERED";
  return { ...order, status: status as KitchenStage };
}

export async function setKitchenStage(tx: Prisma.TransactionClient, context: { establishmentId: string; organizationId: string; actorId: string }, kitchenOrderId: string | null, status: KitchenStage, reason: string) {
  const order = await linkedKitchen(tx, context.establishmentId, kitchenOrderId);
  if (!order) return null;
  const orders = await tx.order.findMany({ where: { OR: [{ id: order.id }, { deliveryParent: { kitchenOrderId: order.id, establishmentId: context.establishmentId } }] } });
  for (const ticket of orders) {
    if (ticket.status === status || (status === "PREPARING" && ticket.status !== "RECEIVED")) continue;
    await tx.order.update({ where: { id: ticket.id }, data: { status } });
    await tx.orderStatusHistory.create({ data: { orderId: ticket.id, status, actorId: context.actorId } });
    await tx.auditEvent.create({ data: { ...context, action: "ORDER_STATUS_CHANGE", entityType: "Order", entityId: ticket.id, reason, before: { status: ticket.status }, after: { status, tabId: ticket.tabId } } });
  }
  return order;
}
