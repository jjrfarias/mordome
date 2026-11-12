import { fulfillmentLabel } from "./order-fulfillment.ts";
import type { PrismaClient } from "../generated/prisma/client";
import { selectedOptionNames } from "./kitchen-print.ts";
import { saleReceiptEscpos } from "./sale-receipt.ts";

export async function queueSaleReceipts(db: PrismaClient, agent: { id: string; establishmentId: string; receiptsActivatedAt: Date | null; establishment: { name: string; document?: string | null } }) {
  if (!agent.receiptsActivatedAt) return;
  const sales = await db.sale.findMany({ where: { establishmentId: agent.establishmentId, completedAt: { gte: agent.receiptsActivatedAt }, status: "COMPLETED", printReceipt: true, receiptPrintJobs: { none: { agentId: agent.id } } }, orderBy: [{ completedAt: "asc" }, { id: "asc" }], take: 50, include: { items: true, payments: true, tab: { include: { table: true } }, deliveryOrder: true } });
  for (const sale of sales) {
    const label = sale.deliveryOrder ? `${fulfillmentLabel(sale.deliveryOrder)} - ${sale.deliveryOrder.customerName}${sale.deliveryOrder.fulfillment === "DELIVERY" ? ` - ${sale.deliveryOrder.address}` : ""}` : sale.tab && !sale.tab.table.isCounter ? `Mesa ${sale.tab.table.number}${sale.tab.name ? ` - ${sale.tab.name}` : ""}` : "Balcao";
    const payload = saleReceiptEscpos({ establishment: agent.establishment.name, document: agent.establishment.document, saleId: sale.id, completedAt: sale.completedAt, label,
      items: sale.items.map(item => ({ name: [item.productName, ...selectedOptionNames(item.selectedOptionsSnapshot)].join(" - "), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), total: Number(item.total) })),
      subtotal: Number(sale.subtotal), discount: Number(sale.discount), serviceAmount: Number(sale.serviceAmount), serviceWaived: sale.serviceWaived, deliveryFee: Number(sale.deliveryFee), total: Number(sale.total),
      payments: sale.payments.map(payment => ({ method: payment.method, amount: Number(payment.amount), receivedAmount: payment.receivedAmount === null ? null : Number(payment.receivedAmount), changeAmount: Number(payment.changeAmount) })) });
    await db.kitchenPrintJob.createMany({ data: [{ agentId: agent.id, saleId: sale.id, payload }], skipDuplicates: true });
  }
}
