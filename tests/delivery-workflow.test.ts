import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deliveryTransitionError } from "../lib/delivery-workflow.ts";
import { createLocalDeliveryOrder, attachLocalDeliveryKitchenOrder, changeLocalDeliveryStatus, assignLocalCourier, getLocalDeliveryOrder, attachLocalDeliverySale } from "../lib/local-delivery.ts";
import { createLocalCounterOrder, changeLocalOrderStatus, getLocalCounterOrder, getLocalFloor } from "../lib/local-floor.ts";

function setup() {
  const unit = randomUUID();
  const items = [{ productId: "test", productName: "Test", quantity: 1, unitPrice: 10 }];
  const delivery = createLocalDeliveryOrder(unit, { customerName: "Test", customerPhone: "22999990000", address: "Test 100", items });
  const { order } = createLocalCounterOrder({ establishmentId: unit, operatorId: "test", items });
  attachLocalDeliveryKitchenOrder(unit, delivery.id, order.id);
  assignLocalCourier(unit, delivery.id, "courier");
  return { unit, delivery, order, advance: (status: "PREPARING" | "READY" | "DELIVERED") => changeLocalOrderStatus({ establishmentId: unit, orderId: order.id, actorId: "test", status }) };
}

test("Delivery waits for kitchen and departure finishes the kitchen ticket", () => {
  const { unit, delivery, order, advance } = setup();
  assert.equal(attachLocalDeliverySale(unit, delivery.id, "sale"), "INVALID_TRANSITION");
  advance("PREPARING");
  assert.equal(getLocalDeliveryOrder(unit, delivery.id)?.status, "PREPARING");
  assert.equal(changeLocalDeliveryStatus(unit, delivery.id, "OUT_FOR_DELIVERY"), "KITCHEN_NOT_READY");
  advance("READY");
  assert.equal(advance("DELIVERED"), "DELIVERY_HANDOFF_REQUIRED");
  assert.equal(typeof changeLocalDeliveryStatus(unit, delivery.id, "OUT_FOR_DELIVERY"), "object");
  assert.equal(getLocalCounterOrder(unit, order.id)?.status, "DELIVERED");
  assert.equal(getLocalFloor(unit).orders.some(item => item.id === order.id), false);
  assert.equal(typeof attachLocalDeliverySale(unit, delivery.id, "sale"), "object");
  assert.equal(getLocalDeliveryOrder(unit, delivery.id)?.status, "DELIVERED");
});

test("Starting preparation from delivery also starts kitchen", () => {
  const { unit, delivery, order } = setup();
  changeLocalDeliveryStatus(unit, delivery.id, "PREPARING");
  assert.equal(getLocalCounterOrder(unit, order.id)?.status, "PREPARING");
});

test("Legacy completed deliveries can close pending kitchen tickets without altering payment", () => {
  for (const status of ["DELIVERED", "CANCELLED"] as const) {
    const { unit, delivery, order, advance } = setup();
    const stored = getLocalDeliveryOrder(unit, delivery.id)!;
    stored.status = status; stored.saleId = "historical-sale";
    assert.equal(typeof advance("DELIVERED"), "object");
    assert.equal(getLocalCounterOrder(unit, order.id)?.status, status);
    assert.equal(stored.saleId, "historical-sale");
    assert.equal(stored.status, status);
    assert.equal(getLocalFloor(unit).orders.some(item => item.id === order.id), false);
  }
});

test("Kitchen lookup cannot cross establishment; missing linked kitchen fails closed", () => {
  const { unit, delivery, order } = setup();
  assert.equal(getLocalCounterOrder("other", order.id), null);
  assert.equal(changeLocalOrderStatus({ establishmentId: "other", orderId: order.id, status: "PREPARING", actorId: "test" }), "ORDER_NOT_FOUND");
  assert.equal(deliveryTransitionError({ status: "PREPARING", courierId: "courier", kitchenOrderId: order.id }, "OUT_FOR_DELIVERY", null), "KITCHEN_NOT_READY");
  assert.equal(getLocalDeliveryOrder(unit, delivery.id)?.status, "RECEIVED");
});
