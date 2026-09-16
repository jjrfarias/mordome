import assert from "node:assert/strict";
import test from "node:test";
import { resolveIngredientSelections } from "../lib/ingredient-options.ts";
import {
  createLocalCatalogProduct,
  createLocalIngredientGroup,
  createLocalIngredientOption,
  listLocalIngredientGroups,
  listLocalCatalog,
} from "../lib/local-catalog.ts";

function setupProductWithGroup(establishmentId: string) {
  const product = createLocalCatalogProduct(establishmentId, { name: `Cachorro-quente ${Date.now()}-${Math.random()}`, category: "Lanches", price: 15, channels: ["POS"] });
  assert.ok(product);
  const group = createLocalIngredientGroup(product!.id, { name: "Molhos", minSelections: 1, maxSelections: 2 });
  assert.ok(group);
  const ketchup = createLocalIngredientOption(product!.id, group!.id, { name: "Ketchup", priceDelta: 0 });
  const bacon = createLocalIngredientOption(product!.id, group!.id, { name: "Bacon extra", priceDelta: 3 });
  assert.ok(ketchup && bacon);
  return { product: product!, group: group!, ketchup: ketchup!, bacon: bacon! };
}

test("produto sem grupos de ingrediente não exige seleção nenhuma", () => {
  const establishmentId = `no-groups-${Date.now()}`;
  const product = createLocalCatalogProduct(establishmentId, { name: `Coca sem grupo ${Date.now()}`, category: "Bebidas", price: 7, channels: ["POS"] });
  assert.ok(product);
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product!.id);
  assert.equal(catalog?.ingredientGroups.length, 0);
  const resolved = resolveIngredientSelections(catalog!.ingredientGroups, undefined);
  assert.ok(!("error" in resolved));
  if (!("error" in resolved)) {
    assert.equal(resolved.priceDelta, 0);
    assert.deepEqual(resolved.snapshot, []);
  }
});

test("grupo obrigatório rejeita quando nada é selecionado", () => {
  const establishmentId = `min-${Date.now()}`;
  const { product } = setupProductWithGroup(establishmentId);
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product.id)!;
  const resolved = resolveIngredientSelections(catalog.ingredientGroups, []);
  assert.ok("error" in resolved);
});

test("grupo rejeita quando o número de opções escolhidas excede o máximo", () => {
  const establishmentId = `max-${Date.now()}`;
  const { product, group, ketchup, bacon } = setupProductWithGroup(establishmentId);
  const terceira = createLocalIngredientOption(product.id, group.id, { name: "Maionese", priceDelta: 0 });
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product.id)!;
  const resolved = resolveIngredientSelections(catalog.ingredientGroups, [{ groupId: group.id, optionIds: [ketchup.id, bacon.id, terceira!.id] }]);
  assert.ok("error" in resolved);
});

test("preço final soma corretamente o priceDelta das opções escolhidas", () => {
  const establishmentId = `price-${Date.now()}`;
  const { product, group, ketchup, bacon } = setupProductWithGroup(establishmentId);
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product.id)!;
  const resolved = resolveIngredientSelections(catalog.ingredientGroups, [{ groupId: group.id, optionIds: [ketchup.id, bacon.id] }]);
  assert.ok(!("error" in resolved));
  if (!("error" in resolved)) {
    assert.equal(resolved.priceDelta, 3);
    assert.equal(product.price + resolved.priceDelta, 18);
    assert.deepEqual(resolved.snapshot, [
      { groupName: "Molhos", optionName: "Ketchup", priceDelta: 0 },
      { groupName: "Molhos", optionName: "Bacon extra", priceDelta: 3 },
    ]);
  }
});

test("opção inativa não pode ser selecionada mesmo referenciando um id existente", () => {
  const establishmentId = `inactive-${Date.now()}`;
  const { product, group, ketchup } = setupProductWithGroup(establishmentId);
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product.id)!;
  const inactiveGroups = catalog.ingredientGroups.map(g => ({ ...g, options: g.options.map(option => option.id === ketchup.id ? { ...option, active: false } : option) }));
  const resolved = resolveIngredientSelections(inactiveGroups, [{ groupId: group.id, optionIds: [ketchup.id] }]);
  assert.ok("error" in resolved);
});

test("grupos de ingrediente pertencem a um único produto e não vazam para outro produto do cardápio", () => {
  const establishmentId = `iso-${Date.now()}`;
  const { product } = setupProductWithGroup(establishmentId);
  const otherProduct = createLocalCatalogProduct(establishmentId, { name: `Outro produto ${Date.now()}`, category: "Lanches", price: 10, channels: ["POS"] });
  assert.ok(otherProduct);
  const groupsOfProduct = listLocalIngredientGroups(product.id);
  const groupsOfOther = listLocalIngredientGroups(otherProduct!.id);
  assert.equal(groupsOfProduct?.length, 1);
  assert.equal(groupsOfOther?.length, 0);
});
