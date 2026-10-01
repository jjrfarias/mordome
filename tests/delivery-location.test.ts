import test from "node:test";
import assert from "node:assert/strict";
import { confirmedDeliveryCoordinates, deliveryLocationSchema } from "../lib/delivery-location.ts";
import { parseStoredAddress } from "../lib/storefront/delivery.ts";
import { createLocalDeliveryOrder, setLocalDeliveryLocation, getLocalDeliveryOrder, changeLocalDeliveryStatus } from "../lib/local-delivery.ts";

test("CEP ou cliente antigo sem confirmação nunca grava destino", () => {
  assert.deepEqual(confirmedDeliveryCoordinates({ destinationLat: -22, destinationLng: -41 }), { destinationLat: undefined, destinationLng: undefined });
  assert.deepEqual(confirmedDeliveryCoordinates({ destinationLat: -22, destinationLng: -41, locationConfirmed: true }), { destinationLat: -22, destinationLng: -41 });
  for (const input of [{ destinationLat: NaN, destinationLng: 1 }, { destinationLat: 91, destinationLng: 1 }, { destinationLat: 1 }]) assert.equal(confirmedDeliveryCoordinates({ ...input, locationConfirmed: true }).destinationLat, undefined);
});
test("endereço antigo salvo no navegador perde o ponto aproximado", () => {
  const old = { street: "Rua de teste", latitude: -22, longitude: -41 };
  assert.equal(parseStoredAddress(JSON.stringify(old))?.latitude, null);
  assert.equal(parseStoredAddress(JSON.stringify({ ...old, locationConfirmed: true }))?.latitude, -22);
});
test("correção valida coordenadas e exige os dois eixos", () => {
  assert.equal(deliveryLocationSchema.safeParse({ action: "SET_LOCATION", orderId: "a", destinationLat: 0, destinationLng: 0 }).success, true);
  assert.equal(deliveryLocationSchema.safeParse({ action: "SET_LOCATION", orderId: "a", destinationLat: 0 }).success, false);
  assert.equal(deliveryLocationSchema.safeParse({ action: "SET_LOCATION", orderId: "a", destinationLat: 100, destinationLng: 0 }).success, false);
});
test("corrigir ponto mantém isolamento e bloqueia pedidos encerrados", () => {
  const unit = crypto.randomUUID();
  const order = createLocalDeliveryOrder(unit, { customerName: "Teste", customerPhone: "00000000", address: "Endereço sintético", items: [] });
  assert.equal(setLocalDeliveryLocation("outra-unidade", order.id, -22, -41), "NOT_FOUND");
  assert.equal(getLocalDeliveryOrder(unit, order.id)?.destinationLat, null);
  assert.equal(setLocalDeliveryLocation(unit, order.id, 91, 0), "INVALID_LOCATION");
  assert.equal(typeof setLocalDeliveryLocation(unit, order.id, -22, -41), "object");
  assert.equal(getLocalDeliveryOrder(unit, order.id)?.destinationLat, -22);
  changeLocalDeliveryStatus(unit, order.id, "CANCELLED");
  assert.equal(setLocalDeliveryLocation(unit, order.id, -23, -42), "CLOSED");
  assert.equal(getLocalDeliveryOrder(unit, order.id)?.destinationLat, -22);
});
