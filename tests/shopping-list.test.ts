import assert from "node:assert/strict";
import test from "node:test";
import { suggestedPurchaseQuantity } from "../lib/inventory-domain.ts";
import { addLocalStockEntry, createLocalInventoryItem, listLocalInventory } from "../lib/local-inventory.ts";
import {
  createLocalShoppingListItem,
  generateLocalPurchaseOrderFromShoppingList,
  listLocalShoppingListItems,
  updateLocalShoppingListItem,
} from "../lib/local-shopping-list.ts";

/** Reaplica a mesma condição de sugestão automática usada em app/api/admin/inventory/shopping-list/route.ts */
function computeSuggestions(establishmentId: string) {
  return listLocalInventory(establishmentId)
    .filter(item => item.configured && item.minimumStock > 0 && item.balance < item.minimumStock)
    .map(item => ({ inventoryItemId: item.establishmentItemId as string, name: item.name, suggestedQuantity: suggestedPurchaseQuantity(item.minimumStock, item.balance) }));
}

test("item abaixo do mínimo aparece como sugestão automática com a quantidade certa", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const item = createLocalInventoryItem(storeId, { name: `Milho ${crypto.randomUUID()}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 1000, allowNegative: true })!;
  addLocalStockEntry(storeId, item.establishmentItemId!, 300, 1);
  const suggestions = computeSuggestions(storeId);
  const suggestion = suggestions.find(candidate => candidate.inventoryItemId === item.establishmentItemId);
  assert.ok(suggestion);
  assert.equal(suggestion!.suggestedQuantity, 700);
});

test("item com saldo suficiente não aparece como sugestão automática", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const item = createLocalInventoryItem(storeId, { name: `Farinha ${crypto.randomUUID()}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 1000, allowNegative: true })!;
  addLocalStockEntry(storeId, item.establishmentItemId!, 2000, 1);
  const suggestions = computeSuggestions(storeId);
  assert.equal(suggestions.some(candidate => candidate.inventoryItemId === item.establishmentItemId), false);
});

test("item sem estoque mínimo configurado não aparece como sugestão automática", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const item = createLocalInventoryItem(storeId, { name: `Guardanapo ${crypto.randomUUID()}`, baseUnit: "UNIT", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true })!;
  const suggestions = computeSuggestions(storeId);
  assert.equal(suggestions.some(candidate => candidate.inventoryItemId === item.establishmentItemId), false);
});

test("sugestão de compra é minimumStock - balance, arredondada para cima", () => {
  assert.equal(suggestedPurchaseQuantity(10, 4), 6);
  assert.equal(suggestedPurchaseQuantity(10, 9.9994), 0.001);
  assert.equal(suggestedPurchaseQuantity(10, 10), 0);
  assert.equal(suggestedPurchaseQuantity(10, 12), 0);
});

test("item manual criado aparece na lista não resolvida", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const item = createLocalShoppingListItem(storeId, "user-1", { inventoryItemId: "item-1", desiredQuantity: 5, notes: "Fim de semana" });
  assert.equal(item.resolved, false);
  const list = listLocalShoppingListItems(storeId, { resolved: false });
  assert.equal(list.some(candidate => candidate.id === item.id), true);
});

test("marcar item manual como providenciado remove da lista ativa", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const item = createLocalShoppingListItem(storeId, "user-1", { inventoryItemId: "item-1", desiredQuantity: 5 });
  const updated = updateLocalShoppingListItem(storeId, item.id, { resolved: true });
  if (updated === "NOT_FOUND") throw new Error("unexpected result");
  assert.equal(updated.resolved, true);
  const activeList = listLocalShoppingListItems(storeId, { resolved: false });
  assert.equal(activeList.some(candidate => candidate.id === item.id), false);
});

test("gerar ordem de compra a partir de itens selecionados cria a ordem e marca manuais como resolvidos", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const manualItem = createLocalShoppingListItem(storeId, "user-1", { inventoryItemId: "item-manual", desiredQuantity: 3 });

  const result = generateLocalPurchaseOrderFromShoppingList(storeId, "user-1", {
    supplierId: "supplier-1",
    selectedItems: [
      { inventoryItemId: "item-auto", quantity: 6 },
      { inventoryItemId: manualItem.inventoryItemId, quantity: manualItem.desiredQuantity, shoppingListItemId: manualItem.id },
    ],
  });
  if (result === "EMPTY" || result === "ITEM_NOT_FOUND") throw new Error("unexpected result");
  assert.equal(result.order.status, "DRAFT");
  assert.equal(result.order.supplierId, "supplier-1");
  assert.equal(result.order.items.length, 2);
  assert.equal(result.order.items.some(item => item.inventoryItemId === "item-auto" && item.quantity === 6), true);
  assert.equal(result.resolvedIds.includes(manualItem.id), true);

  const stillActive = listLocalShoppingListItems(storeId, { resolved: false });
  assert.equal(stillActive.some(candidate => candidate.id === manualItem.id), false);
});

test("gerar ordem sem itens selecionados é bloqueado", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const result = generateLocalPurchaseOrderFromShoppingList(storeId, "user-1", { selectedItems: [] });
  assert.equal(result, "EMPTY");
});

test("lista de compras não vaza entre estabelecimentos", () => {
  const storeA = `store-a-${crypto.randomUUID()}`;
  const storeB = `store-b-${crypto.randomUUID()}`;
  createLocalShoppingListItem(storeA, "user-1", { inventoryItemId: "item-1", desiredQuantity: 1 });
  createLocalShoppingListItem(storeB, "user-1", { inventoryItemId: "item-1", desiredQuantity: 1 });
  assert.equal(listLocalShoppingListItems(storeA).length, 1);
  assert.equal(listLocalShoppingListItems(storeB).length, 1);
});
