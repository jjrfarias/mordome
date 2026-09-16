import { randomUUID } from "node:crypto";
import { addLocalPurchaseOrderItem, createLocalPurchaseOrder } from "./local-purchase-orders.ts";

export type LocalShoppingListItem = {
  id: string;
  establishmentId: string;
  inventoryItemId: string;
  desiredQuantity: number;
  notes: string | null;
  resolved: boolean;
  createdById: string;
  createdAt: string;
};

const items: LocalShoppingListItem[] = [];

function serialize(item: LocalShoppingListItem): LocalShoppingListItem {
  return { ...item };
}

export function listLocalShoppingListItems(establishmentId: string, filters?: { resolved?: boolean }) {
  return items
    .filter(item => item.establishmentId === establishmentId)
    .filter(item => filters?.resolved === undefined || item.resolved === filters.resolved)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(serialize);
}

export function createLocalShoppingListItem(establishmentId: string, actorId: string, data: { inventoryItemId: string; desiredQuantity: number; notes?: string | null }) {
  const item: LocalShoppingListItem = {
    id: `local-shopping-list-item-${randomUUID()}`,
    establishmentId,
    inventoryItemId: data.inventoryItemId,
    desiredQuantity: data.desiredQuantity,
    notes: data.notes ?? null,
    resolved: false,
    createdById: actorId,
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  return serialize(item);
}

export function updateLocalShoppingListItem(establishmentId: string, itemId: string, changes: { desiredQuantity?: number; notes?: string | null; resolved?: boolean }) {
  const item = items.find(candidate => candidate.id === itemId && candidate.establishmentId === establishmentId);
  if (!item) return "NOT_FOUND" as const;
  if (changes.desiredQuantity !== undefined) item.desiredQuantity = changes.desiredQuantity;
  if (changes.notes !== undefined) item.notes = changes.notes;
  if (changes.resolved !== undefined) item.resolved = changes.resolved;
  return serialize(item);
}

/**
 * Gera uma ordem de compra (rascunho) a partir de itens selecionados da lista de compras,
 * reaproveitando a mesma sequência de operações de `createLocalPurchaseOrder`/`addLocalPurchaseOrderItem`
 * (nunca duplicando a lógica de ordem de compra). Itens manuais selecionados (identificados por
 * `shoppingListItemId`) são marcados como `resolved: true` ao final — sugestões automáticas não têm
 * `shoppingListItemId` e continuam sendo recalculadas em tempo real enquanto o saldo real estiver baixo.
 */
export function generateLocalPurchaseOrderFromShoppingList(
  establishmentId: string,
  actorId: string,
  data: { supplierId?: string | null; selectedItems: { inventoryItemId: string; quantity: number; shoppingListItemId?: string }[] },
) {
  if (data.selectedItems.length === 0) return "EMPTY" as const;
  for (const selected of data.selectedItems) {
    if (selected.shoppingListItemId) {
      const found = items.find(item => item.id === selected.shoppingListItemId && item.establishmentId === establishmentId);
      if (!found) return "ITEM_NOT_FOUND" as const;
    }
  }

  let order = createLocalPurchaseOrder(establishmentId, actorId, { supplierId: data.supplierId ?? null });
  for (const selected of data.selectedItems) {
    const result = addLocalPurchaseOrderItem(establishmentId, order.id, { inventoryItemId: selected.inventoryItemId, quantity: selected.quantity, estimatedUnitCost: 0 });
    if (result !== "NOT_FOUND" && result !== "NOT_DRAFT") order = result;
  }

  const resolvedIds: string[] = [];
  for (const selected of data.selectedItems) {
    if (!selected.shoppingListItemId) continue;
    const updated = updateLocalShoppingListItem(establishmentId, selected.shoppingListItemId, { resolved: true });
    if (updated !== "NOT_FOUND") resolvedIds.push(selected.shoppingListItemId);
  }

  return { order, resolvedIds };
}
