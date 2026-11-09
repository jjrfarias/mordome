import { isMarketplaceOrder } from "./ifood-import.ts";
import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";

export class OrderTableError extends Error {}
export async function linkOrderTable(db: PrismaClient, actor: { establishmentId: string; organizationId: string; userId: string; canManageFloor: boolean }, input: { orderId: string; tableId: string }) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delivery:${input.orderId}`}))`;
    const order = await tx.deliveryOrder.findFirst({ where: { id: input.orderId, establishmentId: actor.establishmentId, establishment: { organizationId: actor.organizationId } } });
    if (!order || isMarketplaceOrder(order.origin) || order.saleId || !["RECEIVED", "PREPARING"].includes(order.status)) throw new OrderTableError("Selecione um pedido aberto, ainda não pago nem despachado. Pedidos do iFood e 99Food continuam no Gestor.");
    const table = await tx.diningTable.findFirst({ where: { id: input.tableId, establishmentId: actor.establishmentId, active: true, isCounter: false, ...(actor.canManageFloor ? {} : { OR: [{ assignedWaiterId: null }, { assignedWaiterId: actor.userId }] }) } });
    if (!table) throw new OrderTableError("Mesa indisponível para este operador.");
    const kitchen = order.kitchenOrderId ? await tx.order.findFirst({ where: { id: order.kitchenOrderId, tab: { establishmentId: actor.establishmentId, status: "OPEN" } }, include: { tab: { include: { table: true } } } }) : null;
    if (!kitchen || kitchen.status === "CANCELLED") throw new OrderTableError("Pedido sem comanda aberta.");
    if (!kitchen.tab.table.isCounter) {
      if (kitchen.tab.tableId === table.id) return { tabId: kitchen.tabId, tableNumber: table.number };
      throw new OrderTableError("Este pedido já está vinculado a outra mesa.");
    }
    const name = `${order.customerName.slice(0, 43)} · ${order.id.slice(-8)}`;
    await tx.tab.update({ where: { id: kitchen.tabId }, data: { tableId: table.id, name } });
    await tx.deliveryOrder.update({ where: { id: order.id }, data: { fulfillment: "DINE_IN", status: "PREPARING", deliveryFee: 0, deliveryAreaId: null, courierId: null, destinationLat: null, destinationLng: null, address: `Mesa ${table.number}` } });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, establishmentId: actor.establishmentId, actorId: actor.userId, action: "UPDATE", entityType: "DeliveryOrder", entityId: order.id, reason: "Pedido vinculado à mesa pelo operador", before: { fulfillment: order.fulfillment, deliveryFee: Number(order.deliveryFee ?? 0), tableId: kitchen.tab.tableId }, after: { tableId: table.id, tableNumber: table.number, tabId: kitchen.tabId, name, fulfillment: "DINE_IN", deliveryFee: 0 } } });
    return { tabId: kitchen.tabId, tableNumber: table.number };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
