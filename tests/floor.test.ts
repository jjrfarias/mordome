import assert from "node:assert/strict";
import test from "node:test";
import { addLocalTabItem, cancelLocalSentItem, changeLocalOrderStatus, changeLocalTabItem, closeLocalTab, getLocalFloor, sendLocalOrder } from "../lib/local-floor.ts";

test("primeiro item abre comanda e mantém salão isolado por unidade", () => {
  const suffix = Date.now().toString(); const unitA = `floor-a-${suffix}`; const unitB = `floor-b-${suffix}`;
  const table = getLocalFloor(unitA).tables[0];
  const result = addLocalTabItem({ establishmentId: unitA, tableId: table.id, operatorId: "waiter-a", product: { id: "product-1", name: "Cachorro-quente" }, unitPrice: 20 });
  assert.notEqual(result, "TABLE_NOT_FOUND"); if (result === "TABLE_NOT_FOUND") return;
  assert.equal(result.opened, true); assert.equal(result.item.quantity, 1); assert.equal(getLocalFloor(unitA).tables[0].tab?.openedById, "waiter-a"); assert.equal(getLocalFloor(unitB).tables[0].tab, null);
});

test("rodadas enviadas à cozinha preservam itens e bloqueiam redução já enviada", () => {
  const unit = `floor-order-${Date.now()}`; const table = getLocalFloor(unit).tables[0];
  const added = addLocalTabItem({ establishmentId: unit, tableId: table.id, operatorId: "waiter", product: { id: "product-2", name: "Batata" }, unitPrice: 12 });
  assert.notEqual(added, "TABLE_NOT_FOUND"); if (added === "TABLE_NOT_FOUND") return;
  const sent = sendLocalOrder({ establishmentId: unit, tabId: added.tab.id, operatorId: "waiter" });
  assert.notEqual(sent, "TAB_NOT_FOUND"); assert.notEqual(sent, "NOTHING_TO_SEND"); if (typeof sent === "string") return;
  assert.equal(sent.order.items[0]?.quantity, 1); assert.equal(changeLocalTabItem({ establishmentId: unit, tabItemId: added.item.id, quantity: 0 }), "ALREADY_SENT");
  const preparing = changeLocalOrderStatus({ establishmentId: unit, orderId: sent.order.id, status: "PREPARING" }); assert.equal(typeof preparing, "object"); if (typeof preparing === "string") return; assert.equal(preparing.before, "RECEIVED");
  assert.equal(getLocalFloor(unit).orders[0]?.status, "PREPARING");
});

test("fechamento vincula venda e libera a mesa", () => {
  const unit = `floor-close-${Date.now()}`; const table = getLocalFloor(unit).tables[0];
  const added = addLocalTabItem({ establishmentId: unit, tableId: table.id, operatorId: "waiter", product: { id: "product-3", name: "Suco" }, unitPrice: 8 });
  assert.notEqual(added, "TABLE_NOT_FOUND"); if (added === "TABLE_NOT_FOUND") return;
  const closed = closeLocalTab({ establishmentId: unit, tabId: added.tab.id, saleId: "sale-1" }); assert.notEqual(closed, "TAB_NOT_FOUND");
  assert.equal(getLocalFloor(unit).tables[0].tab, null);
});

test("cancelamento justificado reduz item enviado e avisa a cozinha", () => {
  const unit = `floor-cancel-${Date.now()}`; const table = getLocalFloor(unit).tables[0];
  const first = addLocalTabItem({ establishmentId: unit, tableId: table.id, operatorId: "waiter", product: { id: "product-cancel", name: "Porção" }, unitPrice: 18 });
  assert.notEqual(first, "TABLE_NOT_FOUND"); if (first === "TABLE_NOT_FOUND") return;
  addLocalTabItem({ establishmentId: unit, tableId: table.id, operatorId: "waiter", product: { id: "product-cancel", name: "Porção" }, unitPrice: 18 });
  const sent = sendLocalOrder({ establishmentId: unit, tabId: first.tab.id, operatorId: "waiter" });
  assert.equal(typeof sent, "object"); if (typeof sent === "string") return;
  const cancelled = cancelLocalSentItem({ establishmentId: unit, tabItemId: first.item.id, quantity: 1, reason: "Cliente desistiu", actorId: "manager" });
  assert.equal(typeof cancelled, "object"); if (typeof cancelled === "string") return;
  assert.equal(cancelled.item.quantity, 1); assert.equal(cancelled.item.sentQuantity, 1);
  const kitchenItem = getLocalFloor(unit).orders[0]?.items[0];
  assert.equal(kitchenItem?.cancellations[0]?.quantity, 1);
  assert.equal(cancelLocalSentItem({ establishmentId: unit, tabItemId: first.item.id, quantity: 2, reason: "Excesso", actorId: "manager" }), "INVALID_CANCEL_QUANTITY");
});
