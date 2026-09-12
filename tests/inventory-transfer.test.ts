import assert from "node:assert/strict";
import test from "node:test";
import { addLocalStockEntry, createLocalInventoryItem, transferLocalStock } from "../lib/local-inventory.ts";

test("transfere estoque entre unidades sem alterar a quantidade total", () => {
  const suffix = Date.now().toString();
  const sourceId = `origem-${suffix}`;
  const destinationId = `destino-${suffix}`;
  const item = createLocalInventoryItem(sourceId, { name: `Milho ${suffix}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  assert.ok(item?.establishmentItemId);
  addLocalStockEntry(sourceId, item.establishmentItemId, 1, 1000);

  const transfer = transferLocalStock({ sourceEstablishmentId: sourceId, destinationEstablishmentId: destinationId, establishmentItemId: item.establishmentItemId, quantity: 200, factorToBase: 1, idempotencyKey: `transfer-${suffix}` });
  assert.equal(typeof transfer, "object");
  if (typeof transfer !== "object") return;
  assert.equal(transfer.source.balance, 800);
  assert.equal(transfer.destination.balance, 200);
  assert.equal(transfer.source.balance + transfer.destination.balance, 1000);
});

test("bloqueia transferência maior que o saldo disponível", () => {
  const suffix = `${Date.now()}-insuficiente`;
  const sourceId = `origem-${suffix}`;
  const item = createLocalInventoryItem(sourceId, { name: `Molho ${suffix}`, baseUnit: "MILLILITER", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  assert.ok(item?.establishmentItemId);
  addLocalStockEntry(sourceId, item.establishmentItemId, 100, 1);
  const transfer = transferLocalStock({ sourceEstablishmentId: sourceId, destinationEstablishmentId: `destino-${suffix}`, establishmentItemId: item.establishmentItemId, quantity: 101, factorToBase: 1, idempotencyKey: `transfer-${suffix}` });
  assert.equal(transfer, "INSUFFICIENT_STOCK");
});

test("não repete uma transferência com a mesma chave", () => {
  const suffix = `${Date.now()}-idempotente`;
  const sourceId = `origem-${suffix}`;
  const destinationId = `destino-${suffix}`;
  const item = createLocalInventoryItem(sourceId, { name: `Batata ${suffix}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  assert.ok(item?.establishmentItemId);
  addLocalStockEntry(sourceId, item.establishmentItemId, 500, 1);
  const input = { sourceEstablishmentId: sourceId, destinationEstablishmentId: destinationId, establishmentItemId: item.establishmentItemId, quantity: 100, factorToBase: 1, idempotencyKey: `transfer-${suffix}` };
  assert.equal(typeof transferLocalStock(input), "object");
  assert.equal(transferLocalStock(input), "DUPLICATE");
});
