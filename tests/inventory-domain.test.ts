import assert from "node:assert/strict";
import test from "node:test";
import { calculateRecipeConsumption, convertToBaseUnit, stockBalance } from "../lib/inventory-domain.ts";

test("converte entrada de um quilograma para mil gramas", () => {
  assert.equal(convertToBaseUnit(1, 1000), 1000);
});

test("uma venda consome duzentos gramas da receita e deixa oitocentos", () => {
  const [consumption] = calculateRecipeConsumption([{ inventoryItemId: "milho", quantity: 200 }]);
  assert.equal(consumption.quantity, 200);
  assert.equal(stockBalance([{ quantity: 1000 }, { quantity: -consumption.quantity }]), 800);
});

test("aplica rendimento e perda técnica à composição", () => {
  const [consumption] = calculateRecipeConsumption([{ inventoryItemId: "molho", quantity: 1000, wastePercent: 10 }], 2, 10);
  assert.equal(consumption.quantity, 220);
});
