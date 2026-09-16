import assert from "node:assert/strict";
import test from "node:test";
import { buildCmvReport, calculateSaleItemCmv, weightedAverageCost } from "../lib/cmv.ts";
import { getLocalAverageCostByInventoryItemId, addLocalStockEntry, createLocalInventoryItem, configureLocalInventoryItem } from "../lib/local-inventory.ts";

test("custo médio ponderado com múltiplas entradas de custos diferentes", () => {
  // 10kg a R$5/kg + 20kg a R$8/kg = (50 + 160) / 30 = 7
  const average = weightedAverageCost([{ quantity: 10, unitCost: 5 }, { quantity: 20, unitCost: 8 }]);
  assert.equal(average, 7);
});

test("custo médio ponderado sem nenhuma entrada com custo é desconhecido (null), nunca zero", () => {
  assert.equal(weightedAverageCost([]), null);
});

test("custo de uma venda com ficha técnica soma os componentes pelo custo médio conhecido", () => {
  const result = calculateSaleItemCmv(
    [{ inventoryItemId: "pao", quantity: 100 }, { inventoryItemId: "salsicha", quantity: 80 }],
    id => (id === "pao" ? 0.02 : 0.05),
  );
  // 100 * 0.02 + 80 * 0.05 = 2 + 4 = 6
  assert.equal(result.cost, 6);
  assert.equal(result.hasUnknownCost, false);
});

test("componente sem custo conhecido marca a venda como custo parcial/desconhecido", () => {
  const result = calculateSaleItemCmv(
    [{ inventoryItemId: "pao", quantity: 100 }, { inventoryItemId: "molho-misterioso", quantity: 10 }],
    id => (id === "pao" ? 0.02 : null),
  );
  assert.equal(result.cost, 2); // só soma o componente conhecido
  assert.equal(result.hasUnknownCost, true);
});

test("venda sem ficha técnica não entra no CMV, mas aparece separada", () => {
  const report = buildCmvReport(
    [
      { productId: "p1", productName: "Cachorro-quente", quantity: 2, revenue: 20, recipe: { components: [{ inventoryItemId: "pao", quantity: 200 }] } },
      { productId: "p2", productName: "Coca-Cola", quantity: 3, revenue: 21, recipe: null },
    ],
    id => (id === "pao" ? 0.02 : null),
  );
  assert.equal(report.products.length, 1);
  assert.equal(report.products[0]?.productName, "Cachorro-quente");
  assert.equal(report.productsWithoutRecipe.length, 1);
  assert.equal(report.productsWithoutRecipe[0]?.productName, "Coca-Cola");
  assert.equal(report.productsWithoutRecipe[0]?.revenue, 21);
});

test("agregação correta de CMV%% e margem no período", () => {
  const report = buildCmvReport(
    [
      { productId: "p1", productName: "Cachorro-quente", quantity: 1, revenue: 10, recipe: { components: [{ inventoryItemId: "pao", quantity: 100 }] } },
    ],
    () => 0.02, // custo = 100 * 0.02 = 2
  );
  assert.equal(report.revenueTotal, 10);
  assert.equal(report.cmvTotal, 2);
  assert.equal(report.cmvPercent, 20);
  assert.equal(report.grossMargin, 8);
  assert.equal(report.marginPercent, 80);
});

test("produtos são ordenados por CMV total decrescente", () => {
  const report = buildCmvReport(
    [
      { productId: "p1", productName: "Barato", quantity: 1, revenue: 10, recipe: { components: [{ inventoryItemId: "a", quantity: 10 }] } },
      { productId: "p2", productName: "Caro", quantity: 1, revenue: 50, recipe: { components: [{ inventoryItemId: "b", quantity: 100 }] } },
    ],
    id => (id === "a" ? 0.1 : 1), // custo Barato = 1, custo Caro = 100
  );
  assert.equal(report.products[0]?.productName, "Caro");
  assert.equal(report.products[1]?.productName, "Barato");
});

test("item sem nenhum custo registrado aparece como desconhecido no relatório agregado", () => {
  const report = buildCmvReport(
    [{ productId: "p1", productName: "Sanduíche misterioso", quantity: 1, revenue: 10, recipe: { components: [{ inventoryItemId: "ingrediente-sem-entrada", quantity: 100 }] } }],
    () => null,
  );
  assert.equal(report.products[0]?.cmv, 0);
  assert.equal(report.products[0]?.hasUnknownCost, true);
  assert.equal(report.hasUnknownCost, true);
});

test("getLocalAverageCostByInventoryItemId calcula custo médio a partir das entradas registradas em modo local", () => {
  const establishmentId = `estab-${crypto.randomUUID()}`;
  const created = createLocalInventoryItem(establishmentId, { name: `Insumo CMV ${crypto.randomUUID()}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  if (!created) throw new Error("unexpected null");
  // Sem nenhuma entrada com custo ainda: desconhecido.
  assert.equal(getLocalAverageCostByInventoryItemId(establishmentId, created.id), null);
  // Entrada de 1kg (1000g) por R$10 -> custo médio de 0.01/g.
  addLocalStockEntry(establishmentId, created.establishmentItemId!, 1, 1000, "Entrada teste", 10);
  assert.equal(getLocalAverageCostByInventoryItemId(establishmentId, created.id), 0.01);
});

test("custo médio de um item não vaza entre estabelecimentos (mesmo InventoryRecord, configurações diferentes)", () => {
  const establishmentA = `estab-a-${crypto.randomUUID()}`;
  const establishmentB = `estab-b-${crypto.randomUUID()}`;
  const created = createLocalInventoryItem(establishmentA, { name: `Insumo isolado ${crypto.randomUUID()}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  if (!created) throw new Error("unexpected null");
  configureLocalInventoryItem(establishmentB, created.id);
  // Só o estabelecimento A recebe uma entrada com custo.
  addLocalStockEntry(establishmentA, created.establishmentItemId!, 1, 1000, "Entrada teste", 10);
  assert.equal(getLocalAverageCostByInventoryItemId(establishmentA, created.id), 0.01);
  assert.equal(getLocalAverageCostByInventoryItemId(establishmentB, created.id), null);
});

test("configureLocalInventoryItem também reflete custo desconhecido sem entradas", () => {
  const establishmentId = `estab-${crypto.randomUUID()}`;
  const created = createLocalInventoryItem(`outra-unidade-${crypto.randomUUID()}`, { name: `Insumo CMV 2 ${crypto.randomUUID()}`, baseUnit: "UNIT", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  if (!created) throw new Error("unexpected null");
  configureLocalInventoryItem(establishmentId, created.id);
  assert.equal(getLocalAverageCostByInventoryItemId(establishmentId, created.id), null);
});
