import assert from "node:assert/strict";
import test from "node:test";
import { addLocalStockEntry, adjustLocalStock, createLocalInventoryItem, getLocalStockPositionHistory } from "../lib/local-inventory.ts";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("saldo acumulado é calculado corretamente movimento a movimento", async () => {
  const suffix = `${Date.now()}-acumulado`;
  const establishmentId = `unidade-${suffix}`;
  const item = createLocalInventoryItem(establishmentId, { name: `Milho ${suffix}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  assert.ok(item?.establishmentItemId);
  const from = new Date(Date.now() - 60_000);

  addLocalStockEntry(establishmentId, item.establishmentItemId, 500, 1, "Entrada inicial");
  await wait(5);
  adjustLocalStock({ establishmentId, establishmentItemId: item.establishmentItemId, kind: "LOSS", quantity: 100, factorToBase: 1, idempotencyKey: `perda-${suffix}`, reason: "Perda de teste" });

  const to = new Date(Date.now() + 60_000);
  const history = getLocalStockPositionHistory(establishmentId, item.establishmentItemId, from, to);
  assert.ok(history);
  assert.equal(history!.openingBalance, 0);
  assert.equal(history!.movements.length, 2);
  assert.equal(history!.movements[0].type, "ENTRY");
  assert.equal(history!.movements[0].runningBalance, 500);
  assert.equal(history!.movements[1].type, "LOSS");
  assert.equal(history!.movements[1].runningBalance, 400);
  assert.equal(history!.closingBalance, 400);
  assert.equal(history!.totalIn, 500);
  assert.equal(history!.totalOut, -100);
});

test("saldo inicial do período é a soma de tudo antes do 'de'", async () => {
  const suffix = `${Date.now()}-abertura`;
  const establishmentId = `unidade-${suffix}`;
  const item = createLocalInventoryItem(establishmentId, { name: `Batata ${suffix}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  assert.ok(item?.establishmentItemId);

  addLocalStockEntry(establishmentId, item.establishmentItemId, 500, 1, "Entrada antes do período");
  await wait(10);
  const from = new Date();
  await wait(10);
  adjustLocalStock({ establishmentId, establishmentItemId: item.establishmentItemId, kind: "LOSS", quantity: 100, factorToBase: 1, idempotencyKey: `perda-${suffix}`, reason: "Perda dentro do período" });
  const to = new Date(Date.now() + 60_000);

  const history = getLocalStockPositionHistory(establishmentId, item.establishmentItemId, from, to);
  assert.ok(history);
  assert.equal(history!.openingBalance, 500);
  assert.equal(history!.movements.length, 1);
  assert.equal(history!.movements[0].type, "LOSS");
  assert.equal(history!.closingBalance, 400);
});

test("filtro por item específico não mistura movimentações de outro item", () => {
  const suffix = `${Date.now()}-item-especifico`;
  const establishmentId = `unidade-${suffix}`;
  const itemA = createLocalInventoryItem(establishmentId, { name: `Item A ${suffix}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  const itemB = createLocalInventoryItem(establishmentId, { name: `Item B ${suffix}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  assert.ok(itemA?.establishmentItemId);
  assert.ok(itemB?.establishmentItemId);

  addLocalStockEntry(establishmentId, itemA.establishmentItemId, 300, 1, "Entrada A");
  addLocalStockEntry(establishmentId, itemB.establishmentItemId, 700, 1, "Entrada B");

  const from = new Date(Date.now() - 60_000);
  const to = new Date(Date.now() + 60_000);
  const historyA = getLocalStockPositionHistory(establishmentId, itemA.establishmentItemId, from, to);
  assert.ok(historyA);
  assert.equal(historyA!.movements.length, 1);
  assert.equal(historyA!.closingBalance, 300);
  assert.ok(historyA!.movements.every(movement => movement.reason !== "Entrada B"));
});

test("histórico de posição não vaza entre estabelecimentos", () => {
  const suffix = `${Date.now()}-isolamento`;
  const establishmentA = `unidade-a-${suffix}`;
  const establishmentB = `unidade-b-${suffix}`;
  const item = createLocalInventoryItem(establishmentA, { name: `Molho ${suffix}`, baseUnit: "MILLILITER", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  assert.ok(item?.establishmentItemId);
  addLocalStockEntry(establishmentA, item.establishmentItemId, 200, 1, "Entrada na unidade A");

  const from = new Date(Date.now() - 60_000);
  const to = new Date(Date.now() + 60_000);
  const historyOtherEstablishment = getLocalStockPositionHistory(establishmentB, item.establishmentItemId, from, to);
  assert.equal(historyOtherEstablishment, null);

  const historySameEstablishment = getLocalStockPositionHistory(establishmentA, item.establishmentItemId, from, to);
  assert.ok(historySameEstablishment);
  assert.equal(historySameEstablishment!.closingBalance, 200);
});
