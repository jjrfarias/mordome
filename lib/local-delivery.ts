import { randomUUID } from "node:crypto";

export type LocalDeliveryStatus = "RECEIVED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
export type LocalDeliveryOrigin = "INTERNAL" | "ONLINE";
type LocalDeliveryItem = { id: string; productId: string; productName: string; quantity: number; unitPrice: number };
type LocalDeliveryOrder = { id: string; customerName: string; customerPhone: string; address: string; destinationLat: number | null; destinationLng: number | null; notes: string; status: LocalDeliveryStatus; origin: LocalDeliveryOrigin; courierId: string | null; saleId: string | null; createdById: string | null; createdAt: string; updatedAt: string; items: LocalDeliveryItem[] };

const stores = new Map<string, LocalDeliveryOrder[]>();
const locations = new Map<string, { lat: number; lng: number; updatedAt: string }>();
const ordersFor = (establishmentId: string) => {
  if (!stores.has(establishmentId)) stores.set(establishmentId, []);
  return stores.get(establishmentId)!;
};

const nextStatus: Partial<Record<LocalDeliveryStatus, LocalDeliveryStatus>> = { RECEIVED: "PREPARING", PREPARING: "OUT_FOR_DELIVERY", OUT_FOR_DELIVERY: "DELIVERED" };

export function listLocalDeliveryOrders(establishmentId: string) {
  return ordersFor(establishmentId).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(order => ({ ...order, items: order.items.map(item => ({ ...item })) }));
}

export function getLocalDeliveryOrder(establishmentId: string, orderId: string) {
  return ordersFor(establishmentId).find(candidate => candidate.id === orderId) ?? null;
}

export function createLocalDeliveryOrder(establishmentId: string, input: { customerName: string; customerPhone: string; address: string; destinationLat?: number; destinationLng?: number; notes?: string; createdById?: string; origin?: LocalDeliveryOrigin; items: { productId: string; productName: string; quantity: number; unitPrice: number }[] }) {
  const now = new Date().toISOString();
  const order: LocalDeliveryOrder = { id: `local-delivery-${randomUUID()}`, customerName: input.customerName, customerPhone: input.customerPhone, address: input.address, destinationLat: input.destinationLat ?? null, destinationLng: input.destinationLng ?? null, notes: input.notes ?? "", status: "RECEIVED", origin: input.origin ?? "INTERNAL", courierId: null, saleId: null, createdById: input.createdById ?? null, createdAt: now, updatedAt: now, items: input.items.map(item => ({ ...item, id: `local-delivery-item-${randomUUID()}` })) };
  ordersFor(establishmentId).push(order);
  return { ...order, items: order.items.map(item => ({ ...item })) };
}

export function setLocalCourierLocation(courierId: string, lat: number, lng: number) {
  locations.set(courierId, { lat, lng, updatedAt: new Date().toISOString() });
}

export function getLocalCourierLocations(courierIds: string[]) {
  return courierIds.filter(id => locations.has(id)).map(id => ({ courierId: id, ...locations.get(id)! }));
}

export function changeLocalDeliveryStatus(establishmentId: string, orderId: string, status: LocalDeliveryStatus) {
  const order = ordersFor(establishmentId).find(candidate => candidate.id === orderId);
  if (!order) return "NOT_FOUND" as const;
  if (order.status === "CANCELLED" || order.status === "DELIVERED") return "INVALID_TRANSITION" as const;
  if (status === "CANCELLED") { const before = order.status; order.status = "CANCELLED"; order.updatedAt = new Date().toISOString(); return { order, before }; }
  if (nextStatus[order.status] !== status) return "INVALID_TRANSITION" as const;
  const before = order.status; order.status = status; order.updatedAt = new Date().toISOString(); return { order, before };
}

export function assignLocalCourier(establishmentId: string, orderId: string, courierId: string | null) {
  const order = ordersFor(establishmentId).find(candidate => candidate.id === orderId);
  if (!order) return "NOT_FOUND" as const;
  order.courierId = courierId;
  order.updatedAt = new Date().toISOString();
  return { ...order, items: order.items.map(item => ({ ...item })) };
}

export function attachLocalDeliverySale(establishmentId: string, orderId: string, saleId: string) {
  const order = ordersFor(establishmentId).find(candidate => candidate.id === orderId);
  if (!order) return "NOT_FOUND" as const;
  order.saleId = saleId;
  order.status = "DELIVERED";
  order.updatedAt = new Date().toISOString();
  return order;
}

// Entregas concluídas por entregador, usadas pelo acerto de entregadores (lib/local-settlements.ts).
export function listLocalDeliveredOrders(establishmentId: string, from: string, to: string) {
  return ordersFor(establishmentId)
    .filter(order => order.status === "DELIVERED" && order.courierId && order.updatedAt >= from && order.updatedAt <= to)
    .map(order => ({ courierId: order.courierId as string, deliveredAt: order.updatedAt }));
}
