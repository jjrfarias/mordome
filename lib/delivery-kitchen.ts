import type { Prisma } from "../generated/prisma/client.ts";
import type { KitchenStage } from "./delivery-workflow.ts";

export async function linkedKitchen(tx: Prisma.TransactionClient, establishmentId: string, kitchenOrderId: string | null) {
  return kitchenOrderId ? tx.order.findFirst({ where: { id: kitchenOrderId, tab: { establishmentId, table: { isCounter: true } } } }) : null;
}

export async function setKitchenStage(tx: Prisma.TransactionClient, context: { establishmentId: string; organizationId: string; actorId: string }, kitchenOrderId: string | null, status: KitchenStage, reason: string) {
  const order = await linkedKitchen(tx, context.establishmentId, kitchenOrderId);
  if (!order || order.status === status) return order;
  await tx.order.update({ where: { id: order.id }, data: { status } });
  await tx.orderStatusHistory.create({ data: { orderId: order.id, status, actorId: context.actorId } });
  await tx.auditEvent.create({ data: { ...context, action: "ORDER_STATUS_CHANGE", entityType: "Order", entityId: order.id, reason, before: { status: order.status }, after: { status, tabId: order.tabId } } });
  return order;
}
