import assert from "node:assert/strict";
import test from "node:test";
import { addLocalTabItem, cancelLocalTab, getLocalFloor, manageLocalNamedTab, sendLocalOrder } from "../lib/local-floor.ts";

test("cancelar a única comanda libera a mesa e retira o pedido da cozinha", () => {
  const establishmentId = `cancel-tab-${Date.now()}`;
  const table = getLocalFloor(establishmentId).tables[0];
  const added = addLocalTabItem({ establishmentId, tableId: table.id, operatorId: "waiter", product: { id: "pastel", name: "Pastel" }, unitPrice: 15 });
  assert.notEqual(added, "TABLE_NOT_FOUND");
  if (added === "TABLE_NOT_FOUND") return;
  const sent = sendLocalOrder({ establishmentId, tabId: added.tab.id, operatorId: "waiter" });
  assert.equal(typeof sent, "object");
  if (typeof sent === "string") return;
  assert.equal(cancelLocalTab({ establishmentId, tabId: added.tab.id, actorId: "waiter", reason: "Cliente desistiu", canCancelSentItems: false }), "CANCEL_PERMISSION_REQUIRED");
  assert.ok(getLocalFloor(establishmentId).tables[0].tab);
  const cancelled = cancelLocalTab({ establishmentId, tabId: added.tab.id, actorId: "manager", reason: "Cliente desistiu", canCancelSentItems: true });
  assert.equal(typeof cancelled, "object");
  if (typeof cancelled === "string") return;
  assert.equal(cancelled.freedTable, true);
  assert.equal(cancelled.tab.status, "CANCELLED");
  assert.equal(cancelled.tab.items[0].active, false);
  assert.equal(cancelled.tab.orders[0].items[0].cancellations[0].quantity, 1);
  assert.equal(getLocalFloor(establishmentId).tables[0].tab, null);
  assert.equal(getLocalFloor(establishmentId).orders.some(order => order.id === sent.order.id), false);
  assert.equal(cancelLocalTab({ establishmentId, tabId: added.tab.id, actorId: "manager", reason: "De novo", canCancelSentItems: true }), "TAB_NOT_FOUND");
});

test("cancelar uma comanda preserva as outras da mesma mesa", () => {
  const establishmentId = `cancel-tabs-${Date.now()}`;
  const table = getLocalFloor(establishmentId).tables[0];
  const ana = manageLocalNamedTab(establishmentId, "waiter", { action: "CREATE_TAB", tableId: table.id, name: "Ana" });
  const bia = manageLocalNamedTab(establishmentId, "waiter", { action: "CREATE_TAB", tableId: table.id, name: "Bia" });
  assert.equal(typeof ana, "object");
  assert.equal(typeof bia, "object");
  if (typeof ana === "string" || typeof bia === "string") return;
  const added = addLocalTabItem({ establishmentId, tableId: table.id, tabId: ana.tab.id, operatorId: "waiter", product: { id: "suco", name: "Suco" }, unitPrice: 8 });
  assert.notEqual(added, "TABLE_NOT_FOUND");
  const cancelled = cancelLocalTab({ establishmentId, tabId: ana.tab.id, actorId: "waiter", reason: "Cliente saiu", canCancelSentItems: false });
  assert.equal(typeof cancelled, "object");
  if (typeof cancelled === "string") return;
  assert.equal(cancelled.freedTable, false);
  assert.equal(cancelled.tab.items[0].active, false);
  assert.deepEqual(getLocalFloor(establishmentId).tables[0].tabs.map(tab => tab.id), [bia.tab.id]);
});
