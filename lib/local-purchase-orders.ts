import { randomUUID } from "node:crypto";
import { addLocalGoodsReceiptItem, createLocalGoodsReceiptNote } from "./local-goods-receipts.ts";

export type LocalPurchaseOrderStatus = "DRAFT" | "SENT" | "RECEIVED" | "CANCELLED";

export type LocalPurchaseOrderItem = {
  id: string;
  inventoryItemId: string;
  quantity: number;
  estimatedUnitCost: number;
};

export type LocalPurchaseOrder = {
  id: string;
  establishmentId: string;
  supplierId: string | null;
  expectedDate: string | null;
  notes: string | null;
  status: LocalPurchaseOrderStatus;
  createdById: string;
  createdAt: string;
  sentAt: string | null;
  generatedNoteId: string | null;
  items: LocalPurchaseOrderItem[];
};

const orders: LocalPurchaseOrder[] = [];

function serialize(order: LocalPurchaseOrder): LocalPurchaseOrder {
  return { ...order, items: order.items.map(item => ({ ...item })) };
}

export function listLocalPurchaseOrders(establishmentId: string, filters?: { status?: LocalPurchaseOrderStatus }) {
  return orders
    .filter(order => order.establishmentId === establishmentId)
    .filter(order => !filters?.status || order.status === filters.status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(serialize);
}

export function getLocalPurchaseOrder(establishmentId: string, orderId: string) {
  const order = orders.find(item => item.id === orderId && item.establishmentId === establishmentId);
  return order ? serialize(order) : null;
}

export function createLocalPurchaseOrder(establishmentId: string, actorId: string, data: { supplierId?: string | null; expectedDate?: string | null; notes?: string | null }) {
  const order: LocalPurchaseOrder = {
    id: `local-purchase-order-${randomUUID()}`,
    establishmentId,
    supplierId: data.supplierId ?? null,
    expectedDate: data.expectedDate ?? null,
    notes: data.notes ?? null,
    status: "DRAFT",
    createdById: actorId,
    createdAt: new Date().toISOString(),
    sentAt: null,
    generatedNoteId: null,
    items: [],
  };
  orders.push(order);
  return serialize(order);
}

export function updateLocalPurchaseOrder(establishmentId: string, orderId: string, changes: { supplierId?: string | null; expectedDate?: string | null; notes?: string | null }) {
  const order = orders.find(item => item.id === orderId && item.establishmentId === establishmentId);
  if (!order) return "NOT_FOUND" as const;
  if (order.status !== "DRAFT") return "NOT_DRAFT" as const;
  if (changes.supplierId !== undefined) order.supplierId = changes.supplierId;
  if (changes.expectedDate !== undefined) order.expectedDate = changes.expectedDate;
  if (changes.notes !== undefined) order.notes = changes.notes;
  return serialize(order);
}

export function addLocalPurchaseOrderItem(establishmentId: string, orderId: string, item: { inventoryItemId: string; quantity: number; estimatedUnitCost: number }) {
  const order = orders.find(candidate => candidate.id === orderId && candidate.establishmentId === establishmentId);
  if (!order) return "NOT_FOUND" as const;
  if (order.status !== "DRAFT") return "NOT_DRAFT" as const;
  const record: LocalPurchaseOrderItem = { id: `local-purchase-order-item-${randomUUID()}`, inventoryItemId: item.inventoryItemId, quantity: item.quantity, estimatedUnitCost: item.estimatedUnitCost };
  order.items.push(record);
  return serialize(order);
}

export function removeLocalPurchaseOrderItem(establishmentId: string, orderId: string, itemId: string) {
  const order = orders.find(candidate => candidate.id === orderId && candidate.establishmentId === establishmentId);
  if (!order) return "NOT_FOUND" as const;
  if (order.status !== "DRAFT") return "NOT_DRAFT" as const;
  const index = order.items.findIndex(candidate => candidate.id === itemId);
  if (index === -1) return "ITEM_NOT_FOUND" as const;
  order.items.splice(index, 1);
  return serialize(order);
}

export function sendLocalPurchaseOrder(establishmentId: string, orderId: string) {
  const order = orders.find(candidate => candidate.id === orderId && candidate.establishmentId === establishmentId);
  if (!order) return "NOT_FOUND" as const;
  if (order.status !== "DRAFT") return "NOT_DRAFT" as const;
  if (order.items.length === 0) return "EMPTY" as const;
  order.status = "SENT";
  order.sentAt = new Date().toISOString();
  return serialize(order);
}

export function cancelLocalPurchaseOrder(establishmentId: string, orderId: string) {
  const order = orders.find(candidate => candidate.id === orderId && candidate.establishmentId === establishmentId);
  if (!order) return "NOT_FOUND" as const;
  if (order.status === "RECEIVED") return "ALREADY_RECEIVED" as const;
  if (order.status === "CANCELLED") return "ALREADY_CANCELLED" as const;
  order.status = "CANCELLED";
  return serialize(order);
}

/**
 * Gera uma nota de entrada em rascunho a partir dos itens da ordem, delegando a criação para
 * lib/local-goods-receipts.ts (única integração desta fatia com o estoque real: a ordem em si
 * nunca move estoque, só a nota gerada, quando confirmada, faz isso).
 */
export function generateLocalGoodsReceiptFromPurchaseOrder(establishmentId: string, orderId: string, actorId: string) {
  const order = orders.find(candidate => candidate.id === orderId && candidate.establishmentId === establishmentId);
  if (!order) return "NOT_FOUND" as const;
  if (order.status === "RECEIVED") return "ALREADY_RECEIVED" as const;
  if (order.status === "CANCELLED") return "CANCELLED" as const;
  if (order.items.length === 0) return "EMPTY" as const;

  let note = createLocalGoodsReceiptNote(establishmentId, actorId, {
    supplierId: order.supplierId,
    receivedAt: order.expectedDate ?? new Date().toISOString().slice(0, 10),
    notes: order.notes ? `Gerada a partir da ordem de compra: ${order.notes}` : "Gerada a partir de uma ordem de compra",
  });
  for (const item of order.items) {
    const result = addLocalGoodsReceiptItem(establishmentId, note.id, { inventoryItemId: item.inventoryItemId, quantity: item.quantity, unitCost: item.estimatedUnitCost });
    if (result !== "NOT_FOUND" && result !== "NOT_DRAFT") note = result;
  }

  order.status = "RECEIVED";
  order.generatedNoteId = note.id;
  return { order: serialize(order), note };
}
