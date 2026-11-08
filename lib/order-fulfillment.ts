export type OrderFulfillment = "DELIVERY" | "PICKUP" | "DINE_IN";
export const requiresDelivery = (order: { fulfillment?: string | null }) => !order.fulfillment || order.fulfillment === "DELIVERY";
export function fulfillmentLabel(order: { fulfillment?: string | null; tableNumber?: number | null }) {
  if (order.fulfillment === "PICKUP") return "Retirada no local";
  if (order.fulfillment === "DINE_IN") return "Consumir na loja";
  return "Entrega";
}
export const payableOrderStage = (order: { fulfillment?: string | null; status: string }) => requiresDelivery(order) ? order.status === "OUT_FOR_DELIVERY" : order.status === "PREPARING";
