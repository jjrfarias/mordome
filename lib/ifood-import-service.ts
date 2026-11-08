import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";
import { getCounterTable } from "./counter-table.ts";
import { ifoodImportProblem, ifoodPaymentLabel, ifoodRequestId, type IfoodCapture } from "./ifood-import.ts";

type Actor = { establishmentId: string; organizationId: string; userId: string };
// The unique constraint is acquired BEFORE any kitchen writes; all effects commit together.
// Retrying, concurrent clicks and a lost HTTP response all return the original order.
export async function importIfoodOrder(db: PrismaClient, actor: Actor, input: IfoodCapture) {
  const clientRequestId = ifoodRequestId(input.externalId);
  const where = { establishmentId_clientRequestId: { establishmentId: actor.establishmentId, clientRequestId } };
  const existing = await db.deliveryOrder.findUnique({ where });
  if (existing) return { orderId: existing.id, kitchenOrderId: existing.kitchenOrderId, duplicate: true };
  const problem = ifoodImportProblem(input);
  if (problem) throw new Error(problem);
  try {
    return await db.$transaction(async tx => {
      const notes = `iFood #${input.displayId} · ${ifoodPaymentLabel(input.payment)}\nAceite, cobrança, entrega e cancelamento: conferir no Gestor do iFood.\n${input.sourceText}`;
      const created = await tx.deliveryOrder.create({ data: {
        establishmentId: actor.establishmentId, createdById: actor.userId, clientRequestId,
        origin: "IFOOD", customerName: input.customerName, customerPhone: "", address: input.address,
        fulfillment: input.fulfillment, notes, deliveryFee: input.deliveryFeeCents / 100,
        ifoodImport: input,
        items: { create: input.items.map(item => ({ productName: item.name, quantity: item.quantity,
          unitPrice: Math.round(item.lineTotalCents / item.quantity) / 100,
          selectedOptionsSnapshot: item.details ? [{ optionName: item.details }] : Prisma.JsonNull,
        })) },
      } });
      const table = await getCounterTable(tx, actor.establishmentId);
      const tab = await tx.tab.create({ data: { establishmentId: actor.establishmentId, tableId: table.id, openedById: actor.userId, name: `iFood #${input.displayId}` } });
      const tabItems = await Promise.all(input.items.map((item, index) => tx.tabItem.create({ data: {
        tabId: tab.id, addedById: actor.userId, productName: item.name, quantity: item.quantity,
        sentQuantity: item.quantity, unitPrice: Math.round(item.lineTotalCents / item.quantity) / 100,
        notes: index === 0 && input.orderNotes ? input.orderNotes : null,
        selectedOptionsSnapshot: item.details ? [{ optionName: item.details }] : Prisma.JsonNull,
      } })));
      const kitchen = await tx.order.create({ data: { tabId: tab.id, sentById: actor.userId,
        items: { create: tabItems.map(item => ({ tabItemId: item.id, productName: item.productName, quantity: item.quantity })) },
        statusHistory: { create: { status: "RECEIVED", actorId: actor.userId } },
      } });
      await tx.deliveryOrder.update({ where: { id: created.id }, data: { kitchenOrderId: kitchen.id } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, establishmentId: actor.establishmentId, actorId: actor.userId,
        action: "ORDER_SENT", entityType: "Order", entityId: kitchen.id, reason: `Importação assistida do iFood #${input.displayId}`,
        after: { deliveryOrderId: created.id, externalId: input.externalId, payment: input.payment, tabId: tab.id },
      } });
      return { orderId: created.id, kitchenOrderId: kitchen.id, duplicate: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await db.deliveryOrder.findUnique({ where });
      if (duplicate) return { orderId: duplicate.id, kitchenOrderId: duplicate.kitchenOrderId, duplicate: true };
    }
    throw error;
  }
}
