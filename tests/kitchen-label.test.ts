import assert from "node:assert/strict";
import test from "node:test";
import { kitchenOrderLabel, kitchenReportLabel } from "../lib/kitchen-label.ts";
import { attachLocalDeliveryKitchenOrder, createLocalDeliveryOrder } from "../lib/local-delivery.ts";
import { createLocalCounterOrder, getLocalFloor, listLocalOrderTimings } from "../lib/local-floor.ts";

test("Cozinha: rótulo diferencia mesa, PDV e delivery", () => {
  assert.deepEqual(kitchenOrderLabel({ isCounter: false, tableNumber: 7 }), { kicker: "Mesa", title: "07", detail: null, ticket: "Mesa 07" });
  assert.deepEqual(kitchenOrderLabel({ isCounter: true, tableNumber: 0 }), { kicker: "PDV", title: "Balcão", detail: null, ticket: "Balcão" });
  const online = kitchenOrderLabel({ isCounter: true, tableNumber: 0, delivery: { deliveryOrderId: "local-delivery-abc09f38c", origin: "ONLINE", customerName: "Maria Souza" } });
  assert.deepEqual(online, { kicker: "Delivery · Online", title: "#09F38C", detail: "Maria", ticket: "Delivery #09F38C · Maria" });
  assert.equal(kitchenOrderLabel({ isCounter: true, tableNumber: 0, delivery: { deliveryOrderId: "x123456", origin: "INTERNAL", customerName: "" } }).kicker, "Delivery");
});

test("Cozinha (modo local): pedido de delivery na fila aparece como delivery, não como PDV", () => {
  const establishmentId = `kds-delivery-${Date.now()}`;
  const items = [{ productId: "p1", productName: "Pastel de Carne", quantity: 1 }];
  const pos = createLocalCounterOrder({ establishmentId, operatorId: "user-1", items });
  const delivery = createLocalDeliveryOrder(establishmentId, { customerName: "João Pereira", customerPhone: "11999999999", address: "Rua A, 1", origin: "ONLINE", items: items.map(item => ({ ...item, unitPrice: 10 })) });
  const kitchen = createLocalCounterOrder({ establishmentId, operatorId: "user-1", items });
  attachLocalDeliveryKitchenOrder(establishmentId, delivery.id, kitchen.order.id);

  const orders = getLocalFloor(establishmentId).orders;
  const posOrder = orders.find(order => order.id === pos.order.id)!;
  const deliveryOrder = orders.find(order => order.id === kitchen.order.id)!;
  assert.equal(kitchenOrderLabel(posOrder).ticket, "Balcão");
  assert.equal(deliveryOrder.delivery?.deliveryOrderId, delivery.id);
  assert.equal(deliveryOrder.delivery?.customerName, "João", "a cozinha recebe só o primeiro nome");
  assert.equal(kitchenOrderLabel(deliveryOrder).kicker, "Delivery · Online");
  // Isolamento: outra unidade não enxerga o vínculo.
  assert.equal(getLocalFloor(`${establishmentId}-outra`).orders.length, 0);
});

test("Relatórios de tempo: delivery identificado sem dado pessoal do cliente", () => {
  assert.equal(kitchenReportLabel({ isCounter: false, tableNumber: 3 }), "Mesa 3");
  assert.equal(kitchenReportLabel({ isCounter: true, tableNumber: 0 }), "Balcão");
  assert.equal(kitchenReportLabel({ isCounter: true, tableNumber: 0, delivery: { deliveryOrderId: "abc09f38c", origin: "ONLINE" } }), "Delivery online #09F38C");

  const establishmentId = `report-delivery-${Date.now()}`;
  const items = [{ productId: "p1", productName: "Pastel", quantity: 1 }];
  const pos = createLocalCounterOrder({ establishmentId, operatorId: "user-1", items });
  const delivery = createLocalDeliveryOrder(establishmentId, { customerName: "Ana Lima", customerPhone: "11999999999", address: "Rua B, 2", items: items.map(item => ({ ...item, unitPrice: 8 })) });
  const kitchen = createLocalCounterOrder({ establishmentId, operatorId: "user-1", items });
  attachLocalDeliveryKitchenOrder(establishmentId, delivery.id, kitchen.order.id);
  const timings = listLocalOrderTimings(establishmentId, new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
  assert.equal(timings.find(row => row.orderId === pos.order.id)?.tableLabel, "Balcão");
  const label = timings.find(row => row.orderId === kitchen.order.id)?.tableLabel ?? "";
  assert.match(label, /^Delivery #[A-Z0-9]{6}$/);
  assert.ok(!label.includes("Ana"));
});
