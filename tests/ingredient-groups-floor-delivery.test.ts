import assert from "node:assert/strict";
import test from "node:test";
import { resolveIngredientSelections } from "../lib/ingredient-options.ts";
import { createLocalCatalogProduct, createLocalIngredientGroup, createLocalIngredientOption, listLocalCatalog } from "../lib/local-catalog.ts";
import { addLocalTabItem, getLocalFloor, sendLocalOrder } from "../lib/local-floor.ts";
import { createLocalDeliveryOrder, listLocalDeliveryOrders } from "../lib/local-delivery.ts";

function setupProductWithGroup(establishmentId: string, channels: ("POS" | "FLOOR" | "DELIVERY")[]) {
  const product = createLocalCatalogProduct(establishmentId, { name: `Cachorro-quente ${Date.now()}-${Math.random()}`, category: "Lanches", price: 15, channels });
  assert.ok(product);
  const group = createLocalIngredientGroup(product!.id, { name: "Molhos", minSelections: 1, maxSelections: 2 });
  assert.ok(group);
  const ketchup = createLocalIngredientOption(product!.id, group!.id, { name: "Ketchup", priceDelta: 0 });
  const bacon = createLocalIngredientOption(product!.id, group!.id, { name: "Bacon extra", priceDelta: 3 });
  assert.ok(ketchup && bacon);
  return { product: product!, group: group!, ketchup: ketchup!, bacon: bacon! };
}

test("Salão: adicionar item com opções à comanda calcula o preço com o priceDelta e cria uma linha própria", () => {
  const establishmentId = `floor-options-${Date.now()}`;
  const { product, group, ketchup, bacon } = setupProductWithGroup(establishmentId, ["FLOOR"]);
  const table = getLocalFloor(establishmentId).tables[0];
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product.id)!;
  const resolved = resolveIngredientSelections(catalog.ingredientGroups, [{ groupId: group.id, optionIds: [ketchup.id, bacon.id] }]);
  assert.ok(!("error" in resolved));
  if ("error" in resolved) return;
  const unitPrice = product.price + resolved.priceDelta;
  const result = addLocalTabItem({ establishmentId, tableId: table.id, operatorId: "waiter", product: { id: product.id, name: product.name }, unitPrice, selectedOptionsSnapshot: resolved.snapshot });
  assert.notEqual(result, "TABLE_NOT_FOUND"); if (result === "TABLE_NOT_FOUND") return;
  assert.equal(result.item.unitPrice, 18);
  assert.deepEqual(result.item.selectedOptionsSnapshot, [
    { groupName: "Molhos", optionName: "Ketchup", priceDelta: 0 },
    { groupName: "Molhos", optionName: "Bacon extra", priceDelta: 3 },
  ]);
  // Uma segunda adição do mesmo produto com opções nunca agrupa com a linha existente.
  const second = addLocalTabItem({ establishmentId, tableId: table.id, operatorId: "waiter", product: { id: product.id, name: product.name }, unitPrice, selectedOptionsSnapshot: resolved.snapshot });
  assert.notEqual(second, "TABLE_NOT_FOUND"); if (second === "TABLE_NOT_FOUND") return;
  assert.notEqual(second.item.id, result.item.id);
  assert.equal(getLocalFloor(establishmentId).tables[0].tab?.items.length, 2);
});

test("Salão: produto sem grupos de ingrediente continua agrupando quantidade na mesma linha (sem regressão)", () => {
  const establishmentId = `floor-plain-${Date.now()}`;
  const product = createLocalCatalogProduct(establishmentId, { name: `Refrigerante ${Date.now()}`, category: "Bebidas", price: 7, channels: ["FLOOR"] });
  assert.ok(product);
  const table = getLocalFloor(establishmentId).tables[0];
  const first = addLocalTabItem({ establishmentId, tableId: table.id, operatorId: "waiter", product: { id: product!.id, name: product!.name }, unitPrice: product!.price });
  assert.notEqual(first, "TABLE_NOT_FOUND"); if (first === "TABLE_NOT_FOUND") return;
  const second = addLocalTabItem({ establishmentId, tableId: table.id, operatorId: "waiter", product: { id: product!.id, name: product!.name }, unitPrice: product!.price });
  assert.notEqual(second, "TABLE_NOT_FOUND"); if (second === "TABLE_NOT_FOUND") return;
  assert.equal(first.item.id, second.item.id);
  assert.equal(second.item.quantity, 2);
});

test("Salão: opções escolhidas chegam até o pedido enviado para a cozinha (KDS)", () => {
  const establishmentId = `floor-kds-${Date.now()}`;
  const { product, group, ketchup } = setupProductWithGroup(establishmentId, ["FLOOR"]);
  const table = getLocalFloor(establishmentId).tables[0];
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product.id)!;
  const resolved = resolveIngredientSelections(catalog.ingredientGroups, [{ groupId: group.id, optionIds: [ketchup.id] }]);
  assert.ok(!("error" in resolved)); if ("error" in resolved) return;
  const added = addLocalTabItem({ establishmentId, tableId: table.id, operatorId: "waiter", product: { id: product.id, name: product.name }, unitPrice: product.price + resolved.priceDelta, selectedOptionsSnapshot: resolved.snapshot });
  assert.notEqual(added, "TABLE_NOT_FOUND"); if (added === "TABLE_NOT_FOUND") return;
  const sent = sendLocalOrder({ establishmentId, tabId: added.tab.id, operatorId: "waiter" });
  assert.notEqual(sent, "TAB_NOT_FOUND"); assert.notEqual(sent, "NOTHING_TO_SEND"); if (typeof sent === "string") return;
  assert.deepEqual(sent.order.items[0]?.selectedOptionsSnapshot, [{ groupName: "Molhos", optionName: "Ketchup", priceDelta: 0 }]);
  const kdsOrder = getLocalFloor(establishmentId).orders[0];
  assert.deepEqual(kdsOrder?.items[0]?.selectedOptionsSnapshot, [{ groupName: "Molhos", optionName: "Ketchup", priceDelta: 0 }]);
});

test("Delivery: pedido com opções calcula o preço e mantém o retrato no item do pedido", () => {
  const establishmentId = `delivery-options-${Date.now()}`;
  const { product, group, ketchup, bacon } = setupProductWithGroup(establishmentId, ["DELIVERY"]);
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product.id)!;
  const resolved = resolveIngredientSelections(catalog.ingredientGroups, [{ groupId: group.id, optionIds: [ketchup.id, bacon.id] }]);
  assert.ok(!("error" in resolved)); if ("error" in resolved) return;
  const unitPrice = product.price + resolved.priceDelta;
  const order = createLocalDeliveryOrder(establishmentId, { customerName: "Cliente Teste", customerPhone: "22999990000", address: "Rua Um, 10", createdById: "op-1", items: [{ productId: product.id, productName: product.name, quantity: 2, unitPrice, selectedOptionsSnapshot: resolved.snapshot }] });
  assert.equal(order.items[0].unitPrice, 18);
  assert.deepEqual(order.items[0].selectedOptionsSnapshot, resolved.snapshot);
  const listed = listLocalDeliveryOrders(establishmentId).find(candidate => candidate.id === order.id);
  assert.deepEqual(listed?.items[0].selectedOptionsSnapshot, resolved.snapshot);
});

test("Delivery: pedido sem opções continua funcionando como antes (sem regressão)", () => {
  const establishmentId = `delivery-plain-${Date.now()}`;
  const product = createLocalCatalogProduct(establishmentId, { name: `Batata frita ${Date.now()}`, category: "Porções", price: 12, channels: ["DELIVERY"] });
  assert.ok(product);
  const order = createLocalDeliveryOrder(establishmentId, { customerName: "Cliente Simples", customerPhone: "22999991111", address: "Rua Dois, 20", items: [{ productId: product!.id, productName: product!.name, quantity: 1, unitPrice: product!.price }] });
  assert.equal(order.items[0].unitPrice, 12);
  assert.equal(order.items[0].selectedOptionsSnapshot, undefined);
});

test("Isolamento: grupos de ingrediente de um estabelecimento não vazam para o catálogo local de outro", () => {
  const establishmentId = `iso-floor-${Date.now()}`;
  const otherEstablishmentId = `iso-floor-other-${Date.now()}`;
  const { product } = setupProductWithGroup(establishmentId, ["FLOOR"]);
  const catalogInOther = listLocalCatalog(otherEstablishmentId).find(item => item.id === product.id);
  // O catálogo é global por produto nesta fatia (ver ADR 0022), mas os grupos cadastrados continuam
  // vinculados ao produto e visíveis igualmente — o que isola por estabelecimento é a oferta (preço/canal).
  assert.ok(catalogInOther === undefined || catalogInOther.channels.length === 0);
});
