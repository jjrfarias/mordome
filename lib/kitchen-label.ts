import { fulfillmentLabel, requiresDelivery } from "./order-fulfillment.ts";
// Rótulo do pedido na fila da cozinha (KDS) e no tíquete impresso. Pedidos do PDV e do delivery
// chegam à cozinha pela mesma mesa virtual "Balcão" (ADRs 0044 e 0050); o vínculo
// `DeliveryOrder.kitchenOrderId` é o que diferencia um do outro.

export type KitchenDeliverySource = { fulfillment?: "DELIVERY" | "PICKUP" | "DINE_IN"; status?: "RECEIVED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED"; deliveryOrderId: string; origin: "ONLINE" | "INTERNAL"; customerName: string };
export type KitchenLabelInput = { isCounter?: boolean; tableNumber: number; tabName?: string; delivery?: KitchenDeliverySource | null };

// Mesmo número curto mostrado ao cliente na confirmação do pedido online.
export const deliveryShortNumber = (deliveryOrderId: string) => deliveryOrderId.slice(-6).toUpperCase();

// Só o primeiro nome: o suficiente para a equipe conferir o pedido, sem expor o nome completo na tela.
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export function kitchenOrderLabel(order: KitchenLabelInput) {
  if (order.delivery) {
    const customer = firstName(order.delivery.customerName);
    const mode = requiresDelivery(order.delivery) ? "Delivery" : fulfillmentLabel(order.delivery);
    return {
      kicker: order.delivery.origin === "ONLINE" ? `${mode} · Online` : mode,
      title: `#${deliveryShortNumber(order.delivery.deliveryOrderId)}`,
      detail: customer || null,
      ticket: `${mode} #${deliveryShortNumber(order.delivery.deliveryOrderId)}${customer ? ` · ${customer}` : ""}`,
    };
  }
  if (order.isCounter) return { kicker: "PDV", title: "Balcão", detail: null, ticket: "Balcão" };
  const table = String(order.tableNumber).padStart(2, "0");
  return { kicker: "Mesa", title: table, detail: order.tabName || null, ticket: `Mesa ${table}${order.tabName ? ` · ${order.tabName}` : ""}` };
}

// Relatórios de tempo são exportados (planilha/PDF): o rótulo identifica a origem do pedido sem
// carregar dado pessoal do cliente. Mantém o formato "Mesa N" já usado nesses relatórios.
export function kitchenReportLabel(order: { isCounter?: boolean; tableNumber: number; delivery?: Pick<KitchenDeliverySource, "deliveryOrderId" | "origin" | "fulfillment"> | null }) {
  if (order.delivery && !requiresDelivery(order.delivery)) return `${fulfillmentLabel(order.delivery)} #${deliveryShortNumber(order.delivery.deliveryOrderId)}`;
  if (order.delivery) return `${order.delivery.origin === "ONLINE" ? "Delivery online" : "Delivery"} #${deliveryShortNumber(order.delivery.deliveryOrderId)}`;
  return order.isCounter ? "Balcão" : `Mesa ${order.tableNumber}`;
}
