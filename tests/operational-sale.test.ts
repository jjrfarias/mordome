import assert from "node:assert/strict";
import test from "node:test";
import { addLocalStockEntry, createLocalInventoryItem, listLocalInventory } from "../lib/local-inventory.ts";
import { createLocalRecipe } from "../lib/local-recipes.ts";
import { cancelLocalSale, completeLocalSale, settleLocalSale } from "../lib/local-sales.ts";
import { closeLocalCash, openLocalCash, registerLocalCashSale, summarizeLocalCash } from "../lib/local-cash.ts";
import { createLocalCatalogProduct } from "../lib/local-catalog.ts";

test("venda baixa a ficha técnica uma única vez e cancelamento estorna", () => {
  const establishmentId = `venda-${Date.now()}`;
  const item = createLocalInventoryItem(establishmentId, { name: `Milho venda ${Date.now()}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  assert.ok(item?.establishmentItemId);
  addLocalStockEntry(establishmentId, item.establishmentItemId, 1, 1000);
  const product = createLocalCatalogProduct(establishmentId, { name: `X-Burger ${Date.now()}`, category: "Lanches", price: 20, channels: ["POS"] });
  assert.ok(product);
  const recipe = createLocalRecipe(establishmentId, { productId: product.id, productName: product.name, name: "Ficha X-Burger", yieldQuantity: 1, components: [{ inventoryItemId: item.id, inventoryItemName: item.name, baseUnit: "GRAM", quantity: 200, wastePercent: 0 }] });
  assert.ok(recipe);

  const idempotencyKey = `sale-${Date.now()}`;
  const first = completeLocalSale({ establishmentId, idempotencyKey, channel: "POS", items: [{ productId: product.id, quantity: 1 }] });
  assert.equal(first.status, "COMPLETED");
  assert.equal(listLocalInventory(establishmentId).find(candidate => candidate.id === item.id)?.balance, 800);
  const repeated = completeLocalSale({ establishmentId, idempotencyKey, channel: "POS", items: [{ productId: product.id, quantity: 1 }] });
  assert.equal(repeated.status, "DUPLICATE");
  assert.equal(listLocalInventory(establishmentId).find(candidate => candidate.id === item.id)?.balance, 800);
  assert.ok(first.sale);
  assert.equal(cancelLocalSale({ establishmentId, saleId: first.sale.id }), "CANCELLED");
  assert.equal(listLocalInventory(establishmentId).find(candidate => candidate.id === item.id)?.balance, 1000);
});

test("catálogo operacional respeita o canal da unidade", () => {
  const result = completeLocalSale({ establishmentId: "parque-aeroporto", idempotencyKey: `channel-${Date.now()}`, channel: "POS", items: [{ productId: "p2", quantity: 1 }] });
  assert.equal(result.status, "COMPLETED");
});

test("cancelamento retira a venda do caixa aberto e bloqueia caixa fechado", () => {
  const establishmentId = "parque-aeroporto"; const suffix = Date.now().toString();
  const cash = openLocalCash(establishmentId, `cancel-operator-${suffix}`, 0); assert.ok(cash);
  const first = completeLocalSale({ establishmentId, idempotencyKey: `cash-cancel-${suffix}`, channel: "POS", items: [{ productId: "p1", quantity: 1 }] });
  assert.equal(first.status, "COMPLETED"); assert.ok(first.sale);
  registerLocalCashSale(cash.id, "PIX", 22); settleLocalSale(first.sale.id, { cashSessionId: cash.id, method: "PIX", amount: 22 });
  assert.equal(summarizeLocalCash(cash).expected.PIX, 22);
  assert.equal(cancelLocalSale({ establishmentId, saleId: first.sale.id }), "CANCELLED");
  assert.equal(summarizeLocalCash(cash).expected.PIX, 0);

  const second = completeLocalSale({ establishmentId, idempotencyKey: `cash-closed-${suffix}`, channel: "POS", items: [{ productId: "p1", quantity: 1 }] }); assert.ok(second.sale);
  registerLocalCashSale(cash.id, "PIX", 22); settleLocalSale(second.sale.id, { cashSessionId: cash.id, method: "PIX", amount: 22 });
  closeLocalCash(establishmentId, `cancel-operator-${suffix}`, { PIX: 22, CREDIT_CARD: 0, DEBIT_CARD: 0, CASH: 0, OTHER: 0 });
  assert.equal(cancelLocalSale({ establishmentId, saleId: second.sale.id }), "CASH_CLOSED");
});
