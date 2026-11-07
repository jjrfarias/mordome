import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { addLocalTabItem, closeLocalTab, getLocalFloor, manageLocalNamedTab, sendLocalOrder, changeLocalOrderStatus } from "../lib/local-floor.ts";
import { kitchenOrderLabel } from "../lib/kitchen-label.ts";
import { buildReceiptHtml } from "../lib/integrations/print-client.ts";

test("same table supports named tabs with separate totals and independent payment", () => {
  const unit = randomUUID(), table = getLocalFloor(unit).tables[0];
  const ana = manageLocalNamedTab(unit, "waiter", { action: "CREATE_TAB", tableId: table.id, name: "Ana" });
  const bia = manageLocalNamedTab(unit, "waiter", { action: "CREATE_TAB", tableId: table.id, name: "Bia" });
  assert.ok(typeof ana !== "string" && typeof bia !== "string");
  assert.equal(manageLocalNamedTab(unit, "waiter", { action: "CREATE_TAB", tableId: table.id, name: "ana" }), "DUPLICATE_NAME");
  const added = addLocalTabItem({ establishmentId: unit, tableId: table.id, tabId: ana.tab.id, operatorId: "waiter", product: { id: "pastel", name: "Pastel" }, unitPrice: 20 });
  assert.notEqual(added, "TABLE_NOT_FOUND");
  assert.equal(getLocalFloor(unit).tables[0].tabs.find(tab => tab.id === bia.tab.id)?.items.length, 0);
  const sent = sendLocalOrder({ establishmentId: unit, tabId: ana.tab.id, operatorId: "waiter" });
  assert.ok(typeof sent !== "string");
  closeLocalTab({ establishmentId: unit, tabId: ana.tab.id, saleId: "sale-ana" });
  assert.equal(getLocalFloor(unit).tables[0].tabs.length, 1);
  assert.equal(getLocalFloor(unit).tables[0].tab?.id, bia.tab.id);
  assert.equal(getLocalFloor(unit).orders[0].tabName, "Ana");
  assert.ok(typeof changeLocalOrderStatus({ establishmentId: unit, orderId: sent.order.id, status: "PREPARING", actorId: "waiter" }) !== "string");
  assert.equal(manageLocalNamedTab("other-unit", "waiter", { action: "RENAME_TAB", tabId: bia.tab.id, name: "Intruso" }), "TAB_NOT_FOUND");
});

test("kitchen identifies the named tab", () => { assert.equal(kitchenOrderLabel({ tableNumber: 4, tabName: "Ana" }).ticket, "Mesa 04 · Ana"); });

test("named receipt escapes customer text", () => {
  const html = buildReceiptHtml({ establishmentName: "Loja", items: [], total: 0, payment: "Pix", channel: "FLOOR", table: 4, tabName: "Ana <script>" });
  assert.ok(html.includes("Mesa 4 · Ana &lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});
