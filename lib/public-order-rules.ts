export function canAddToPublicOrder(order: { fulfillment: string; status: string; saleId: string | null }, tabStatus?: string | null) {
  return order.fulfillment === "DINE_IN" && !order.saleId && order.status !== "CANCELLED" && tabStatus === "OPEN";
}
