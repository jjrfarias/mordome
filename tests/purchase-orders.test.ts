import assert from "node:assert/strict";
import test from "node:test";
import {
  addLocalPurchaseOrderItem,
  cancelLocalPurchaseOrder,
  createLocalPurchaseOrder,
  generateLocalGoodsReceiptFromPurchaseOrder,
  getLocalPurchaseOrder,
  listLocalPurchaseOrders,
  removeLocalPurchaseOrderItem,
  sendLocalPurchaseOrder,
  updateLocalPurchaseOrder,
} from "../lib/local-purchase-orders.ts";

test("ordem de compra começa em rascunho e pode ganhar/perder itens livremente", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const order = createLocalPurchaseOrder(storeId, "user-1", { expectedDate: "2026-09-20" });
  assert.equal(order.status, "DRAFT");
  assert.equal(order.items.length, 0);

  const withItem = addLocalPurchaseOrderItem(storeId, order.id, { inventoryItemId: "item-1", quantity: 10, estimatedUnitCost: 2.5 });
  if (withItem === "NOT_FOUND" || withItem === "NOT_DRAFT") throw new Error("unexpected result");
  assert.equal(withItem.items.length, 1);

  const withSecondItem = addLocalPurchaseOrderItem(storeId, order.id, { inventoryItemId: "item-2", quantity: 5, estimatedUnitCost: 4 });
  if (withSecondItem === "NOT_FOUND" || withSecondItem === "NOT_DRAFT") throw new Error("unexpected result");
  assert.equal(withSecondItem.items.length, 2);

  const removed = removeLocalPurchaseOrderItem(storeId, order.id, withSecondItem.items[0]!.id);
  if (removed === "NOT_FOUND" || removed === "NOT_DRAFT" || removed === "ITEM_NOT_FOUND") throw new Error("unexpected result");
  assert.equal(removed.items.length, 1);
});

test("cabeçalho da ordem pode ser editado enquanto rascunho", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const order = createLocalPurchaseOrder(storeId, "user-1", {});
  const updated = updateLocalPurchaseOrder(storeId, order.id, { notes: "Compra mensal" });
  if (updated === "NOT_FOUND" || updated === "NOT_DRAFT") throw new Error("unexpected result");
  assert.equal(updated.notes, "Compra mensal");
});

test("enviar ordem trava edição de itens e cabeçalho, mas permite cancelar", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const order = createLocalPurchaseOrder(storeId, "user-1", {});
  addLocalPurchaseOrderItem(storeId, order.id, { inventoryItemId: "item-1", quantity: 10, estimatedUnitCost: 2.5 });

  const sent = sendLocalPurchaseOrder(storeId, order.id);
  if (sent === "NOT_FOUND" || sent === "NOT_DRAFT" || sent === "EMPTY") throw new Error("unexpected result");
  assert.equal(sent.status, "SENT");
  assert.notEqual(sent.sentAt, null);

  const blockedAdd = addLocalPurchaseOrderItem(storeId, order.id, { inventoryItemId: "item-2", quantity: 1, estimatedUnitCost: 1 });
  assert.equal(blockedAdd, "NOT_DRAFT");
  const blockedRemove = removeLocalPurchaseOrderItem(storeId, order.id, sent.items[0]!.id);
  assert.equal(blockedRemove, "NOT_DRAFT");
  const blockedHeader = updateLocalPurchaseOrder(storeId, order.id, { notes: "outro" });
  assert.equal(blockedHeader, "NOT_DRAFT");

  const cancelled = cancelLocalPurchaseOrder(storeId, order.id);
  if (cancelled === "NOT_FOUND" || cancelled === "ALREADY_RECEIVED" || cancelled === "ALREADY_CANCELLED") throw new Error("unexpected result");
  assert.equal(cancelled.status, "CANCELLED");
});

test("não é possível enviar ordem vazia", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const order = createLocalPurchaseOrder(storeId, "user-1", {});
  assert.equal(sendLocalPurchaseOrder(storeId, order.id), "EMPTY");
});

test("gerar nota de entrada cria a nota com os itens corretos e marca a ordem como recebida", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const order = createLocalPurchaseOrder(storeId, "user-1", { supplierId: "supplier-1", expectedDate: "2026-09-22" });
  addLocalPurchaseOrderItem(storeId, order.id, { inventoryItemId: "item-1", quantity: 10, estimatedUnitCost: 2.5 });
  addLocalPurchaseOrderItem(storeId, order.id, { inventoryItemId: "item-2", quantity: 4, estimatedUnitCost: 3 });

  const result = generateLocalGoodsReceiptFromPurchaseOrder(storeId, order.id, "user-1");
  if (result === "NOT_FOUND" || result === "ALREADY_RECEIVED" || result === "CANCELLED" || result === "EMPTY") throw new Error("unexpected result");
  assert.equal(result.order.status, "RECEIVED");
  assert.equal(result.order.generatedNoteId, result.note.id);
  assert.equal(result.note.status, "DRAFT");
  assert.equal(result.note.supplierId, "supplier-1");
  assert.equal(result.note.items.length, 2);
  assert.equal(result.note.items[0]!.quantity, 10);
  assert.equal(result.note.items[0]!.unitCost, 2.5);

  const stillPersisted = getLocalPurchaseOrder(storeId, order.id);
  assert.equal(stillPersisted?.status, "RECEIVED");
});

test("bloqueia gerar nota duas vezes e bloqueia cancelar ordem já recebida", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const order = createLocalPurchaseOrder(storeId, "user-1", {});
  addLocalPurchaseOrderItem(storeId, order.id, { inventoryItemId: "item-1", quantity: 1, estimatedUnitCost: 1 });
  generateLocalGoodsReceiptFromPurchaseOrder(storeId, order.id, "user-1");

  const secondAttempt = generateLocalGoodsReceiptFromPurchaseOrder(storeId, order.id, "user-1");
  assert.equal(secondAttempt, "ALREADY_RECEIVED");

  const cancelAttempt = cancelLocalPurchaseOrder(storeId, order.id);
  assert.equal(cancelAttempt, "ALREADY_RECEIVED");
});

test("não é possível gerar nota de ordem vazia nem de ordem cancelada", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const emptyOrder = createLocalPurchaseOrder(storeId, "user-1", {});
  assert.equal(generateLocalGoodsReceiptFromPurchaseOrder(storeId, emptyOrder.id, "user-1"), "EMPTY");

  const cancelledOrder = createLocalPurchaseOrder(storeId, "user-1", {});
  addLocalPurchaseOrderItem(storeId, cancelledOrder.id, { inventoryItemId: "item-1", quantity: 1, estimatedUnitCost: 1 });
  cancelLocalPurchaseOrder(storeId, cancelledOrder.id);
  assert.equal(generateLocalGoodsReceiptFromPurchaseOrder(storeId, cancelledOrder.id, "user-1"), "CANCELLED");
});

test("ordens de compra não vazam entre estabelecimentos", () => {
  const storeA = `store-a-${crypto.randomUUID()}`;
  const storeB = `store-b-${crypto.randomUUID()}`;
  createLocalPurchaseOrder(storeA, "user-1", {});
  createLocalPurchaseOrder(storeB, "user-1", {});
  assert.equal(listLocalPurchaseOrders(storeA).length, 1);
  assert.equal(listLocalPurchaseOrders(storeB).length, 1);
});

test("listagem filtra por status", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const draft = createLocalPurchaseOrder(storeId, "user-1", {});
  const toSend = createLocalPurchaseOrder(storeId, "user-1", {});
  addLocalPurchaseOrderItem(storeId, toSend.id, { inventoryItemId: "item-1", quantity: 1, estimatedUnitCost: 1 });
  sendLocalPurchaseOrder(storeId, toSend.id);

  assert.equal(listLocalPurchaseOrders(storeId, { status: "DRAFT" }).some(item => item.id === draft.id), true);
  assert.equal(listLocalPurchaseOrders(storeId, { status: "DRAFT" }).some(item => item.id === toSend.id), false);
  assert.equal(listLocalPurchaseOrders(storeId, { status: "SENT" }).some(item => item.id === toSend.id), true);
});
