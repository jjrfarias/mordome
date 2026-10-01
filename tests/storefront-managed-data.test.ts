import assert from "node:assert/strict";
import test from "node:test";
import { formatBrazilPhone, normalizeBrazilPhone } from "../lib/phone.ts";
import { compareAtPriceError } from "../lib/catalog-validation.ts";
import { isCompleteOrder, moveItem, sortByCategoryOrder } from "../lib/category-order.ts";
import { createLocalCatalogProduct, listLocalCatalog, listLocalCategories, setLocalCategoryOrder, updateLocalCatalogProduct } from "../lib/local-catalog.ts";
import { mapLiveStorefront } from "../lib/storefront/live-adapter.ts";
import { availableQuickFilters, productBadge, selectProducts, emptyFilters } from "../lib/storefront/catalog.ts";

test("Telefone da unidade: aceita DDD + 8 ou 9 dígitos, vazio limpa e o resto é inválido", () => {
  assert.equal(normalizeBrazilPhone("(11) 98765-4321"), "11987654321");
  assert.equal(normalizeBrazilPhone("+55 21 3333-4444"), "2133334444");
  assert.equal(normalizeBrazilPhone("  "), null);
  assert.equal(normalizeBrazilPhone("98765-4321"), undefined);
  assert.equal(normalizeBrazilPhone("123456789012"), undefined);
  assert.equal(formatBrazilPhone("11987654321"), "(11) 98765-4321");
  assert.equal(formatBrazilPhone("2133334444"), "(21) 3333-4444");
  assert.equal(formatBrazilPhone(null), null);
});

test("Preço anterior: opcional e sempre maior que o preço atual", () => {
  assert.equal(compareAtPriceError(28.9, null), null);
  assert.equal(compareAtPriceError(28.9, undefined), null);
  assert.equal(compareAtPriceError(28.9, 38.9), null);
  assert.match(compareAtPriceError(28.9, 28.9) ?? "", /maior/);
  assert.match(compareAtPriceError(28.9, 20) ?? "", /maior/);
  assert.equal(compareAtPriceError(0.1 + 0.2, 0.31), null, "compara em centavos, sem erro de ponto flutuante");
  assert.equal(compareAtPriceError(10, Number.NaN), "Preço anterior inválido.");
});

test("Ordem de categorias: mover, validar lista completa e ordenar itens", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
  assert.equal(isCompleteOrder(["b", "a"], ["a", "b"]), true);
  assert.equal(isCompleteOrder(["a"], ["a", "b"]), false, "lista parcial");
  assert.equal(isCompleteOrder(["a", "a"], ["a", "b"]), false, "repetição");
  assert.equal(isCompleteOrder(["a", "x"], ["a", "b"]), false, "categoria de outra organização");
  const items = [{ id: 1, category: "Bebidas" }, { id: 2, category: "Lanches" }, { id: 3, category: "Nova" }, { id: 4, category: "Bebidas" }];
  assert.deepEqual(sortByCategoryOrder(items, item => item.category, ["Lanches", "Bebidas"]).map(item => item.id), [2, 1, 4, 3]);
});

test("Modo local: ordem das categorias é aplicada e categorias novas entram no fim", () => {
  const suffix = Date.now();
  createLocalCatalogProduct("ordem-teste", { name: `Sobremesa ${suffix}`, category: `Sobremesas ${suffix}`, price: 10, channels: ["DELIVERY"] });
  const before = listLocalCategories().map(category => category.id);
  const reversed = [...before].reverse();
  assert.deepEqual(setLocalCategoryOrder(reversed).map(category => category.id), reversed);
  createLocalCatalogProduct("ordem-teste", { name: `Entrada ${suffix}`, category: `Aaa Entradas ${suffix}`, price: 10, channels: ["DELIVERY"] });
  const after = listLocalCategories().map(category => category.id);
  assert.deepEqual(after.slice(0, reversed.length), reversed);
  assert.equal(after.at(-1), `Aaa Entradas ${suffix}`);
  assert.ok(listLocalCategories().every(category => category.productCount >= 1));
});

test("Modo local: preço anterior é por unidade e some quando o preço passa a ser maior", () => {
  const unit = `promo-${Date.now()}`;
  const created = createLocalCatalogProduct(unit, { name: `Burger promo ${unit}`, category: "Lanches", price: 28.9, channels: ["DELIVERY"], compareAtPrice: 38.9, vegetarian: true });
  assert.ok(created);
  let item = listLocalCatalog(unit).find(product => product.id === created.id)!;
  assert.deepEqual([item.compareAtPrice, item.vegetarian], [38.9, true]);
  assert.equal(listLocalCatalog(`${unit}-outra`).find(product => product.id === created.id)!.compareAtPrice, null, "outra unidade não herda a promoção");
  updateLocalCatalogProduct(unit, created.id, { price: 30, channels: ["DELIVERY"] });
  item = listLocalCatalog(unit).find(product => product.id === created.id)!;
  assert.equal(item.compareAtPrice, 38.9, "mantém enquanto continua maior");
  updateLocalCatalogProduct(unit, created.id, { price: 40, channels: ["DELIVERY"] });
  item = listLocalCatalog(unit).find(product => product.id === created.id)!;
  assert.equal(item.compareAtPrice, null, "não anuncia desconto inexistente");
  updateLocalCatalogProduct(unit, created.id, { price: 40, channels: ["DELIVERY"], vegetarian: false, compareAtPrice: 45 });
  item = listLocalCatalog(unit).find(product => product.id === created.id)!;
  assert.deepEqual([item.compareAtPrice, item.vegetarian], [45, false]);
});

test("Vitrine real: preço anterior e vegetariano cadastrados viram selo e filtros", () => {
  const data = mapLiveStorefront("loja", {
    establishment: { name: "Loja", logoUrl: null, bannerUrl: null, highlightHeadline: null, highlightProduct: null, phone: "(11) 98765-4321", address: null },
    products: [
      { id: "p1", name: "Burger", category: "Lanches", description: null, price: 28.9, compareAtPrice: 38.9, vegetarian: false, imageUrl: null },
      { id: "p2", name: "Salada", category: "Saudáveis", description: null, price: 30, compareAtPrice: null, vegetarian: true, imageUrl: null },
      { id: "p3", name: "Suco", category: "Bebidas", description: null, price: 9, imageUrl: null },
    ],
    deliveryAreas: [],
  });
  assert.equal(data.products[0].compareAtPriceCents, 3890);
  assert.equal(productBadge(data.products[0]), "Oferta");
  assert.deepEqual(availableQuickFilters(data.products), { popular: false, rating: false, promotions: true, vegetarian: true });
  assert.deepEqual(selectProducts(data.products, data.categories, { ...emptyFilters, vegetarianOnly: true }).map(product => product.id), ["p2"]);
  assert.deepEqual(data.categories.map(category => category.name), ["Lanches", "Saudáveis", "Bebidas"], "ordem das categorias segue a ordem da API");
  assert.equal(data.establishment.phone, "(11) 98765-4321");
});
