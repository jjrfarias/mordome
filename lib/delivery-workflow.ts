export type KitchenStage = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
export type DeliveryStage = "RECEIVED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
export const kitchenReady = (status: string | null | undefined) => status === "READY" || status === "DELIVERED";
export const deliveryFinished = (status: string | null | undefined) => status === "DELIVERED" || status === "CANCELLED";

export function deliveryTransitionError(order: { status: DeliveryStage; courierId: string | null; kitchenOrderId: string | null }, target: DeliveryStage, kitchenStatus: KitchenStage | null) {
  const next: Partial<Record<DeliveryStage, DeliveryStage>> = { RECEIVED: "PREPARING", PREPARING: "OUT_FOR_DELIVERY", OUT_FOR_DELIVERY: "DELIVERED" };
  if (deliveryFinished(order.status) || (target !== "CANCELLED" && next[order.status] !== target)) return "INVALID_TRANSITION";
  if (target === "CANCELLED") return null;
  if (order.kitchenOrderId && (!kitchenStatus || kitchenStatus === "CANCELLED")) return "KITCHEN_NOT_READY";
  if ((target === "OUT_FOR_DELIVERY" || target === "DELIVERED") && order.kitchenOrderId && !kitchenReady(kitchenStatus)) return "KITCHEN_NOT_READY";
  if (target === "OUT_FOR_DELIVERY" && !order.courierId) return "COURIER_REQUIRED";
  return null;
}

export const workflowMessages: Record<string, string> = {
  INVALID_TRANSITION: "Esta mudança de etapa não é permitida.",
  KITCHEN_NOT_READY: "Aguarde a cozinha marcar o pedido como pronto antes de sair para entrega.",
  COURIER_REQUIRED: "Defina o entregador antes de iniciar a rota.",
  DELIVERY_NOT_IN_ROUTE: "O pedido precisa sair para entrega antes de cobrar e concluir.",
  DELIVERY_HANDOFF_REQUIRED: "Registre a saída para entrega na tela de delivery.",
};
