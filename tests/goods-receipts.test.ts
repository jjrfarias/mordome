import assert from "node:assert/strict";
import test from "node:test";
import {
  addLocalGoodsReceiptItem,
  confirmLocalGoodsReceiptNote,
  createLocalGoodsReceiptNote,
  getLocalGoodsReceiptNote,
  listLocalGoodsReceiptNotes,
  removeLocalGoodsReceiptItem,
  updateLocalGoodsReceiptNote,
} from "../lib/local-goods-receipts.ts";

function createStockEntryStub(balances: Map<string, number>) {
  return (item: { inventoryItemId: string; quantity: number; unitCost: number }) => {
    if (item.inventoryItemId === "missing-item") return null;
    balances.set(item.inventoryItemId, (balances.get(item.inventoryItemId) ?? 0) + item.quantity);
    return { id: `movement-${item.inventoryItemId}-${balances.get(item.inventoryItemId)}` };
  };
}

test("nota de entrada começa em rascunho e pode ganhar/perder itens livremente", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const note = createLocalGoodsReceiptNote(storeId, "user-1", { receivedAt: "2026-09-16" });
  assert.equal(note.status, "DRAFT");
  assert.equal(note.items.length, 0);

  const withItem = addLocalGoodsReceiptItem(storeId, note.id, { inventoryItemId: "item-1", quantity: 10, unitCost: 2.5 });
  if (withItem === "NOT_FOUND" || withItem === "NOT_DRAFT") throw new Error("unexpected result");
  assert.equal(withItem.items.length, 1);

  const withSecondItem = addLocalGoodsReceiptItem(storeId, note.id, { inventoryItemId: "item-2", quantity: 5, unitCost: 4 });
  if (withSecondItem === "NOT_FOUND" || withSecondItem === "NOT_DRAFT") throw new Error("unexpected result");
  assert.equal(withSecondItem.items.length, 2);

  const removed = removeLocalGoodsReceiptItem(storeId, note.id, withSecondItem.items[0]!.id);
  if (removed === "NOT_FOUND" || removed === "NOT_DRAFT" || removed === "ITEM_NOT_FOUND") throw new Error("unexpected result");
  assert.equal(removed.items.length, 1);
});

test("cabeçalho da nota pode ser editado enquanto rascunho", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const note = createLocalGoodsReceiptNote(storeId, "user-1", { receivedAt: "2026-09-16" });
  const updated = updateLocalGoodsReceiptNote(storeId, note.id, { documentNumber: "NF 999", notes: "Compra avulsa" });
  if (updated === "NOT_FOUND" || updated === "NOT_DRAFT") throw new Error("unexpected result");
  assert.equal(updated.documentNumber, "NF 999");
  assert.equal(updated.notes, "Compra avulsa");
});

test("confirmar nota gera movimentação por item e trava edição", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const balances = new Map<string, number>();
  const note = createLocalGoodsReceiptNote(storeId, "user-1", { receivedAt: "2026-09-16" });
  addLocalGoodsReceiptItem(storeId, note.id, { inventoryItemId: "item-1", quantity: 10, unitCost: 2.5 });
  addLocalGoodsReceiptItem(storeId, note.id, { inventoryItemId: "item-2", quantity: 4, unitCost: 3 });

  const confirmed = confirmLocalGoodsReceiptNote(storeId, note.id, createStockEntryStub(balances));
  if (confirmed === "NOT_FOUND" || confirmed === "ALREADY_CONFIRMED" || confirmed === "EMPTY" || confirmed === "ITEM_NOT_FOUND") throw new Error("unexpected result");
  assert.equal(confirmed.status, "CONFIRMED");
  assert.notEqual(confirmed.confirmedAt, null);
  assert.equal(confirmed.items.every(item => item.stockMovementId !== null), true);
  assert.equal(balances.get("item-1"), 10);
  assert.equal(balances.get("item-2"), 4);

  const blockedEdit = addLocalGoodsReceiptItem(storeId, note.id, { inventoryItemId: "item-3", quantity: 1, unitCost: 1 });
  assert.equal(blockedEdit, "NOT_DRAFT");
  const blockedRemoval = removeLocalGoodsReceiptItem(storeId, note.id, confirmed.items[0]!.id);
  assert.equal(blockedRemoval, "NOT_DRAFT");
  const blockedHeaderEdit = updateLocalGoodsReceiptNote(storeId, note.id, { documentNumber: "outro" });
  assert.equal(blockedHeaderEdit, "NOT_DRAFT");
});

test("não é possível confirmar nota vazia nem confirmar a mesma nota duas vezes", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const balances = new Map<string, number>();
  const emptyNote = createLocalGoodsReceiptNote(storeId, "user-1", { receivedAt: "2026-09-16" });
  assert.equal(confirmLocalGoodsReceiptNote(storeId, emptyNote.id, createStockEntryStub(balances)), "EMPTY");

  const note = createLocalGoodsReceiptNote(storeId, "user-1", { receivedAt: "2026-09-16" });
  addLocalGoodsReceiptItem(storeId, note.id, { inventoryItemId: "item-1", quantity: 2, unitCost: 1 });
  const firstConfirm = confirmLocalGoodsReceiptNote(storeId, note.id, createStockEntryStub(balances));
  assert.notEqual(firstConfirm, "ALREADY_CONFIRMED");
  const secondConfirm = confirmLocalGoodsReceiptNote(storeId, note.id, createStockEntryStub(balances));
  assert.equal(secondConfirm, "ALREADY_CONFIRMED");
});

test("confirmação falha e não avança se algum item referenciar estoque inexistente", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const balances = new Map<string, number>();
  const note = createLocalGoodsReceiptNote(storeId, "user-1", { receivedAt: "2026-09-16" });
  addLocalGoodsReceiptItem(storeId, note.id, { inventoryItemId: "missing-item", quantity: 2, unitCost: 1 });
  const result = confirmLocalGoodsReceiptNote(storeId, note.id, createStockEntryStub(balances));
  assert.equal(result, "ITEM_NOT_FOUND");
  const stillDraft = getLocalGoodsReceiptNote(storeId, note.id);
  assert.equal(stillDraft?.status, "DRAFT");
});

test("notas de entrada não vazam entre estabelecimentos", () => {
  const storeA = `store-a-${crypto.randomUUID()}`;
  const storeB = `store-b-${crypto.randomUUID()}`;
  createLocalGoodsReceiptNote(storeA, "user-1", { receivedAt: "2026-09-16" });
  createLocalGoodsReceiptNote(storeB, "user-1", { receivedAt: "2026-09-16" });
  assert.equal(listLocalGoodsReceiptNotes(storeA).length, 1);
  assert.equal(listLocalGoodsReceiptNotes(storeB).length, 1);
});

test("listagem filtra por status", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const balances = new Map<string, number>();
  const draft = createLocalGoodsReceiptNote(storeId, "user-1", { receivedAt: "2026-09-16" });
  const toConfirm = createLocalGoodsReceiptNote(storeId, "user-1", { receivedAt: "2026-09-17" });
  addLocalGoodsReceiptItem(storeId, toConfirm.id, { inventoryItemId: "item-1", quantity: 1, unitCost: 1 });
  confirmLocalGoodsReceiptNote(storeId, toConfirm.id, createStockEntryStub(balances));

  assert.equal(listLocalGoodsReceiptNotes(storeId, { status: "DRAFT" }).some(item => item.id === draft.id), true);
  assert.equal(listLocalGoodsReceiptNotes(storeId, { status: "DRAFT" }).some(item => item.id === toConfirm.id), false);
  assert.equal(listLocalGoodsReceiptNotes(storeId, { status: "CONFIRMED" }).some(item => item.id === toConfirm.id), true);
});
