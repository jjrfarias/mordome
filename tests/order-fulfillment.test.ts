import assert from "node:assert/strict";
import test from "node:test";
import { deliveryTransitionError } from "../lib/delivery-workflow.ts";
import { payableOrderStage } from "../lib/order-fulfillment.ts";
import { kitchenOrderLabel } from "../lib/kitchen-label.ts";

for (const fulfillment of ["PICKUP", "DINE_IN"] as const) {
  test(`${fulfillment}: no courier or route; completion requires ready kitchen`, () => {
    const order = { fulfillment, status: "PREPARING" as const, courierId: null, kitchenOrderId: "kitchen" };
    assert.equal(deliveryTransitionError(order, "OUT_FOR_DELIVERY", "READY"), "INVALID_TRANSITION");
    assert.equal(deliveryTransitionError(order, "DELIVERED", "PREPARING"), "KITCHEN_NOT_READY");
    assert.equal(deliveryTransitionError(order, "DELIVERED", "READY"), null);
    assert.equal(payableOrderStage(order), true);
    assert.equal(payableOrderStage({ ...order, status: "DELIVERED" }), false);
    assert.equal(payableOrderStage({ ...order, fulfillment: "DELIVERY" }), false);
    const label = kitchenOrderLabel({ tableNumber: 0, isCounter: true, delivery: { fulfillment, deliveryOrderId: "order-123456", origin: "ONLINE", customerName: "Ana Silva" } });
    assert.match(label.ticket, fulfillment === "PICKUP" ? /Retirada no local/ : /Consumir na loja/);
    assert.ok(label.ticket.includes("Ana"));
  });
}
