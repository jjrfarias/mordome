import { ifoodCaptureSchema, ifoodPaymentLabel } from "./ifood-import.ts";
import { selectedOptionNames } from "./kitchen-print.ts";
import { fulfillmentLabel } from "./order-fulfillment.ts";
import type { Receipt } from "./sale-receipt.ts";

type Amount = number | { toString(): string };
type Item = { productName: string; quantity: number | Amount; unitPrice: Amount; selectedOptionsSnapshot?: unknown };
export type DeliveryPrintOrder = {
  id: string; customerName: string; address: string; notes: string | null; fulfillment?: string;
  status: string; origin: string; saleId: string | null; deliveryFee: Amount | null; ifoodImport?: unknown; items: Item[];
  sale?: { id: string; status: string; completedAt: Date; subtotal: Amount; discount: Amount; serviceAmount: Amount; deliveryFee: Amount; total: Amount; items: (Item & { total: Amount })[]; payments: { method: string; amount: Amount; receivedAmount: Amount | null; changeAmount: Amount }[] } | null;
};

export function deliveryReceipt(order: DeliveryPrintOrder, unit: { name: string; document?: string | null }, mode: "CONFERENCE" | "RECEIPT", discount = 0): Receipt {
  if (order.status === "CANCELLED") throw Error("Pedido cancelado não pode ser impresso.");
  const label = `${fulfillmentLabel(order)} - ${order.customerName}${order.fulfillment === "DELIVERY" ? `\n${order.address}` : ""}${order.notes ? `\nOBS: ${order.notes}` : ""}`;
  const common = { establishment: unit.name, document: unit.document, delivery: true, label };
  if (mode === "RECEIPT") {
    const sale = order.sale;
    if (order.origin === "IFOOD") throw Error("O pagamento deste pedido é controlado pelo iFood. Use a conferência e o comprovante do Gestor.");
    if (!sale || sale.status !== "COMPLETED") throw Error("Conclua o pagamento antes de imprimir o comprovante de venda.");
    return { ...common, saleId: sale.id, completedAt: sale.completedAt,
      items: sale.items.map(item => ({ name: [item.productName, ...selectedOptionNames(item.selectedOptionsSnapshot)].join(" - "), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), total: Number(item.total) })),
      subtotal: Number(sale.subtotal), discount: Number(sale.discount), serviceAmount: Number(sale.serviceAmount), deliveryFee: Number(sale.deliveryFee), total: Number(sale.total),
      payments: sale.payments.map(p => ({ method: p.method, amount: Number(p.amount), receivedAmount: p.receivedAmount === null ? null : Number(p.receivedAmount), changeAmount: Number(p.changeAmount) })) };
  }
  if (order.saleId || order.status === "DELIVERED") throw Error("Pedido encerrado. Imprima o comprovante de pagamento.");
  const ifood = order.origin === "IFOOD" ? ifoodCaptureSchema.safeParse(order.ifoodImport) : null;
  if (ifood && !ifood.success) throw Error("Dados do iFood incompletos. Confira o pedido no Gestor.");
  const imported = ifood?.success ? ifood.data : null;
  const items = imported ? imported.items.map(item => ({ name: `${item.name}${item.details ? ` - ${item.details}` : ""}`, quantity: item.quantity, unitPrice: item.lineTotalCents / 100 / item.quantity, total: item.lineTotalCents / 100 })) : order.items.map(item => ({ name: [item.productName, ...selectedOptionNames(item.selectedOptionsSnapshot)].join(" - "), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), total: Math.round(Number(item.quantity) * Number(item.unitPrice) * 100) / 100 }));
  if (!items.length) throw Error("Pedido sem itens para imprimir.");
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  const deliveryFee = imported ? imported.deliveryFeeCents / 100 : Number(order.deliveryFee ?? 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal + deliveryFee || (imported && discount !== 0)) throw Error("Desconto inválido para esta conferência.");
  discount = Math.round(discount * 100) / 100;
  return { ...common, conference: true, saleId: order.id, completedAt: new Date(), items, subtotal, serviceAmount: 0, deliveryFee, discount,
    total: imported ? imported.subtotalCents / 100 : Math.round((subtotal + deliveryFee - discount) * 100) / 100, payments: [],
    ...(imported ? { totalLabel: "SUBTOTAL NO IFOOD", notice: `iFood #${imported.displayId} - ${ifoodPaymentLabel(imported.payment)}. Descontos, taxas e valor final: confira o Gestor.` } : {}) };
}
