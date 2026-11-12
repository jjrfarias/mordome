import assert from "node:assert/strict";
import test from "node:test";
import { canAddToPublicOrder } from "../lib/public-order-rules.ts";

test("somente consumo na loja com comanda aberta e sem pagamento aceita acréscimos", () => {
  const order = { fulfillment: "DINE_IN", status: "READY", saleId: null };
  assert.equal(canAddToPublicOrder(order, "OPEN"), true);
  assert.equal(canAddToPublicOrder({ ...order, status: "DELIVERED" }, "OPEN"), true);
  assert.equal(canAddToPublicOrder({ ...order, fulfillment: "DELIVERY" }, "OPEN"), false);
  assert.equal(canAddToPublicOrder({ ...order, status: "CANCELLED" }, "OPEN"), false);
  assert.equal(canAddToPublicOrder({ ...order, saleId: "sale-1" }, "OPEN"), false);
  assert.equal(canAddToPublicOrder(order, "PAID"), false);
});
