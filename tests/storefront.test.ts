import assert from "node:assert/strict";
import test from "node:test";
import { addToCart, cartStorageKey, cartSubtotalCents, cartUnits, changeLineQuantity, evaluateCoupon, favoritesStorageKey, orderTotals, parseStoredCart, priceSelection, productRequiresChoice, reconcileCart, restoreLine, serializeCart, type CartLine } from "../lib/storefront/cart.ts";
import { availableQuickFilters, categoryIconKey, emptyFilters, productBadge, rankPopularProducts, selectProducts } from "../lib/storefront/catalog.ts";
import { deliveryFeeLabel, parseStoredAddress, quoteDelivery } from "../lib/storefront/delivery.ts";
import { demoSampleAddress, demoSampleCart, demoStorefront } from "../lib/storefront/demo-data.ts";
import { isStorefrontDemoEnabled } from "../lib/storefront/demo-access.ts";
import { mapLiveStorefront } from "../lib/storefront/live-adapter.ts";
import { formatAddressForOrder, formatCents, toCents, type DeliveryAddress, type StorefrontProduct } from "../lib/storefront/model.ts";

let sequence = 0;
const nextId = () => `line-${++sequence}`;
const product = (id: string) => demoStorefront.products.find(candidate => candidate.id === id)!;
const plain = (item: StorefrontProduct) => { const priced = priceSelection(item, []); assert.ok(priced.ok); return priced; };

test("Vitrine: adicionais opcionais da API abrem escolhas e preservam limites e preços", () => {
  const menu = mapLiveStorefront("unit", {
    establishment: { name: "Unit", logoUrl: null, bannerUrl: null, highlightHeadline: null, highlightProduct: null },
    deliveryAreas: [],
    products: [{ id: "pastel", name: "Pastel", category: "Pastéis", description: null, imageUrl: null, price: 18,
      ingredientGroups: [{ id: "extras", name: "Adicional", minSelections: 0, maxSelections: 1, active: true,
        options: [{ id: "bacon", name: "Bacon", priceDelta: 2, active: true }, { id: "ovo", name: "Ovo", priceDelta: 2, active: true }, { id: "hidden", name: "Inativo", priceDelta: 1, active: false }] }] }],
  });
  const item = menu.products[0];
  assert.equal(productRequiresChoice(item), true);
  assert.equal(item.optionGroups[0].options.length, 2);
  assert.deepEqual(priceSelection(item, []), { ok: true, unitPriceCents: 1800, labels: [], selections: [] });
  const chosen = priceSelection(item, [{ groupId: "extras", optionIds: ["bacon"] }]);
  assert.ok(chosen.ok && chosen.unitPriceCents === 2000 && chosen.labels.includes("Bacon"));
  assert.equal(priceSelection(item, [{ groupId: "extras", optionIds: ["bacon", "ovo"] }]).ok, false);
  assert.equal(productRequiresChoice({ ...item, optionGroups: [] }), false);
});

test("Vitrine: pedido de exemplo reproduz subtotal R$ 52,70, entrega R$ 6,90 e total R$ 59,60 em centavos", () => {
  const lines = demoSampleCart(nextId);
  const quote = quoteDelivery(demoStorefront.deliveryAreas, demoSampleAddress);
  assert.equal(quote.status, "known");
  const totals = orderTotals({ subtotalCents: cartSubtotalCents(lines), discountCents: 0, deliveryFeeCents: quote.status === "known" ? quote.feeCents : null });
  assert.deepEqual([totals.subtotalCents, totals.deliveryFeeCents, totals.totalCents], [5270, 690, 5960]);
  assert.equal(formatCents(totals.totalCents).replace(/\s/g, " "), "R$ 59,60");
  assert.equal(cartUnits(lines), 3);
});

test("Vitrine: valores em reais da API viram centavos sem erro de ponto flutuante", () => {
  assert.equal(toCents(28.9), 2890);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(16.9) + toCents(6.9) + toCents(28.9), 5270);
});

test("Vitrine: busca ignora acentos e maiúsculas e procura em nome, descrição e categoria", () => {
  const search = (query: string) => selectProducts(demoStorefront.products, demoStorefront.categories, { ...emptyFilters, query }).map(item => item.id);
  assert.deepEqual(search("PETIT gâteau"), ["demo-petit-gateau"]);
  assert.ok(search("mucarela").includes("demo-pizza-margherita"));
  assert.ok(search("hamburgueres").includes("demo-cheeseburger"));
  assert.ok(search("saudaveis").includes("demo-bowl-verde"));
  assert.deepEqual(search("xyz inexistente"), []);
});

test("Vitrine: categoria, filtros e ordenação funcionam em conjunto", () => {
  const byPopularity = selectProducts(demoStorefront.products, demoStorefront.categories, { ...emptyFilters, sort: "popular" }).slice(0, 4).map(item => item.name);
  assert.deepEqual(byPopularity, ["Pizza Margherita", "Cheeseburger Clássico", "Penne ao Pomodoro", "Petit Gateau"]);
  const promosInBurgers = selectProducts(demoStorefront.products, demoStorefront.categories, { ...emptyFilters, categoryId: "hamburgueres", promotionsOnly: true }).map(item => item.id);
  assert.deepEqual(promosInBurgers, ["demo-cheeseburger"]);
  const vegetarianCheapFirst = selectProducts(demoStorefront.products, demoStorefront.categories, { ...emptyFilters, vegetarianOnly: true, sort: "price-asc", maxPriceCents: 3000 }).map(item => item.priceCents);
  assert.deepEqual(vegetarianCheapFirst, [690, 1690, 2490]);
  const favorites = selectProducts(demoStorefront.products, demoStorefront.categories, { ...emptyFilters, favoritesOnly: true }, new Set(["demo-penne"])).map(item => item.id);
  assert.deepEqual(favorites, ["demo-penne"]);
});

test("Vitrine: atalhos e selos só aparecem quando há dados que os sustentem", () => {
  const live = mapLiveStorefront("loja-a", { establishment: { name: "Loja A", logoUrl: null, bannerUrl: null, highlightHeadline: null, highlightProduct: null }, products: [{ id: "p1", name: "X", category: "Lanches", description: null, price: 10, imageUrl: null }], deliveryAreas: [] });
  assert.deepEqual(availableQuickFilters(live.products), { popular: false, rating: false, promotions: false, vegetarian: false });
  assert.equal(productBadge(live.products[0]), null);
  assert.equal(live.coupons, null);
  assert.equal(live.loyalty, null);
  assert.equal(live.benefits.length, 0);
  assert.equal(live.slides.length, 0);
  assert.equal(productBadge(product("demo-pizza-margherita")), "Mais pedido");
  assert.equal(productBadge(product("demo-cheeseburger")), "Oferta");
});

test("Vitrine: ranking de mais pedidos exige volume mínimo e agrega por produto", () => {
  const ranking = rankPopularProducts([
    { productId: "a", quantity: 3 }, { productId: "b", quantity: 9 }, { productId: "a", quantity: 3 },
    { productId: "c", quantity: 2 }, { productId: null, quantity: 50 },
  ]);
  assert.deepEqual(ranking, ["b", "a"]);
  const live = mapLiveStorefront("loja-a", { establishment: { name: "Loja A", logoUrl: null, bannerUrl: null, highlightHeadline: null, highlightProduct: null }, products: [{ id: "a", name: "A", category: "C", description: null, price: 1, imageUrl: null }, { id: "b", name: "B", category: "C", description: null, price: 1, imageUrl: null }], deliveryAreas: [], popularProductIds: ranking });
  assert.deepEqual(live.products.map(item => item.popularityRank), [2, 1]);
});

test("Vitrine: adicionar mescla itens iguais e separa escolhas diferentes", () => {
  const burger = product("demo-cheeseburger");
  let lines = addToCart([], burger, plain(burger), 1, nextId);
  lines = addToCart(lines, burger, plain(burger), 2, nextId);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 3);
  const withBacon = priceSelection(burger, [{ groupId: "demo-adicionais", optionIds: ["demo-bacon"] }]);
  assert.ok(withBacon.ok);
  assert.equal(withBacon.unitPriceCents, 3390);
  lines = addToCart(lines, burger, withBacon, 1, nextId);
  assert.equal(lines.length, 2);
  assert.equal(cartSubtotalCents(lines), 3 * 2890 + 3390);
});

test("Vitrine: opções obrigatórias precisam ser escolhidas antes de entrar no carrinho", () => {
  const combo = product("demo-combo-classico");
  assert.equal(productRequiresChoice(combo), true);
  assert.equal(productRequiresChoice(product("demo-cheeseburger")), true);
  const missing = priceSelection(combo, []);
  assert.equal(missing.ok, false);
  const tooMany = priceSelection(combo, [{ groupId: "demo-combo-bebida", optionIds: ["demo-combo-coca", "demo-combo-agua"] }]);
  assert.equal(tooMany.ok, false);
  const valid = priceSelection(combo, [{ groupId: "demo-combo-bebida", optionIds: ["demo-combo-guarana"] }]);
  assert.ok(valid.ok && valid.labels[0] === "Guaraná 350 ml");
  const unknown = priceSelection(combo, [{ groupId: "outro-grupo", optionIds: ["x"] }]);
  assert.equal(unknown.ok, false);
});

test("Vitrine: diminuir até zero remove o item e permite desfazer na mesma posição", () => {
  const lines = demoSampleCart(nextId);
  const removedId = lines[1].lineId;
  const result = changeLineQuantity(lines, removedId, -1);
  assert.equal(result.lines.length, 2);
  assert.ok(result.removed);
  assert.equal(result.removed.line.lineId, removedId);
  const restored = restoreLine(result.lines, result.removed.line, result.removed.index);
  assert.deepEqual(restored.map(line => line.lineId), lines.map(line => line.lineId));
  assert.deepEqual(restoreLine(restored, result.removed.line, 0), restored, "não duplica ao desfazer duas vezes");
  assert.equal(changeLineQuantity(lines, lines[0].lineId, 200).lines[0].quantity, 99);
});

test("Vitrine: cupom percentual respeita mínimo e nunca supera o subtotal", () => {
  const coupons = demoStorefront.coupons!;
  assert.deepEqual(evaluateCoupon(" bemvindo10 ", coupons, 5270), { ok: true, code: "BEMVINDO10", discountCents: 527 });
  assert.equal(evaluateCoupon("BEMVINDO10", coupons, 2000).ok, false);
  assert.equal(evaluateCoupon("NAOEXISTE", coupons, 9000).ok, false);
  assert.deepEqual(evaluateCoupon("FIXO", [{ code: "FIXO", kind: "FIXED", value: 5000, minSubtotalCents: 0 }], 1200), { ok: true, code: "FIXO", discountCents: 1200 });
  const totals = orderTotals({ subtotalCents: 5270, discountCents: 527, deliveryFeeCents: 690 });
  assert.equal(totals.totalCents, 5433);
});

test("Vitrine: taxa depende do endereço e nunca é tratada como grátis quando desconhecida", () => {
  const address: DeliveryAddress = { ...demoSampleAddress, areaId: null };
  assert.deepEqual(quoteDelivery([], address), { status: "confirm" });
  assert.equal(deliveryFeeLabel(quoteDelivery([], address)), "A confirmar");
  assert.deepEqual(quoteDelivery(demoStorefront.deliveryAreas, null), { status: "pending", reason: "address" });
  assert.deepEqual(quoteDelivery(demoStorefront.deliveryAreas, address), { status: "pending", reason: "area" });
  const pending = orderTotals({ subtotalCents: 5270, discountCents: 0, deliveryFeeCents: null });
  assert.equal(pending.totalIsFinal, false);
  assert.equal(deliveryFeeLabel({ status: "pending", reason: "address" }), "A calcular");

  const automatic = [{ id: "a1", name: "Centro", feeCents: 500, neighborhoods: "Centro, Vila Nova" }, { id: "a2", name: "Sul", feeCents: 900, neighborhoods: "Jardim América" }];
  const inArea = quoteDelivery(automatic, { ...address, neighborhood: "vila  nová" });
  assert.equal(inArea.status === "known" && inArea.area.id, "a1");
  assert.deepEqual(quoteDelivery(automatic, { ...address, neighborhood: "Outro Bairro" }), { status: "uncovered" });
});

test("Vitrine: carrinho e favoritos são isolados por estabelecimento", () => {
  assert.notEqual(cartStorageKey("loja-a"), cartStorageKey("loja-b"));
  assert.notEqual(favoritesStorageKey("loja-a"), favoritesStorageKey("loja-b"));
  assert.ok(cartStorageKey("loja-a").endsWith(":loja-a"));
  const liveA = mapLiveStorefront("loja-a", { establishment: { name: "A", logoUrl: null, bannerUrl: null, highlightHeadline: null, highlightProduct: null }, products: [], deliveryAreas: [] });
  assert.equal(liveA.storeKey, "loja-a");
  assert.notEqual(demoStorefront.storeKey, liveA.storeKey);
  // Um carrinho salvo de outra loja não sobrevive à revalidação contra o catálogo desta loja.
  const foreign = demoSampleCart(nextId);
  const reconciled = reconcileCart(foreign, liveA.products);
  assert.equal(reconciled.lines.length, 0);
  assert.equal(reconciled.notices.length, 3);
});

test("Vitrine: revalidação atualiza preço alterado e remove item indisponível", () => {
  const lines: CartLine[] = demoSampleCart(nextId);
  const catalog = demoStorefront.products.filter(item => item.id !== "demo-coca-cola").map(item => item.id === "demo-cheeseburger" ? { ...item, priceCents: 3190 } : item);
  const result = reconcileCart(lines, catalog);
  assert.deepEqual(result.lines.map(line => [line.productId, line.unitPriceCents]), [["demo-cheeseburger", 3190], ["demo-batata-rustica", 1690]]);
  assert.equal(result.notices.length, 2);
  assert.match(result.notices.join(" "), /Coca-Cola 350 ml não está mais disponível/);
  assert.match(result.notices.join(" "), /preço de Cheeseburger Clássico mudou/);
});

test("Vitrine: armazenamento local é tratado como entrada não confiável", () => {
  assert.deepEqual(parseStoredCart(null), []);
  assert.deepEqual(parseStoredCart("{quebrado"), []);
  assert.deepEqual(parseStoredCart(JSON.stringify({ not: "array" })), []);
  assert.deepEqual(parseStoredCart(JSON.stringify([{ lineId: 1 }, { lineId: "x", productId: "p", name: "N", unitPriceCents: 10.5, quantity: 1 }, { lineId: "y", productId: "p", name: "N", unitPriceCents: 100, quantity: 0 }])), []);
  const lines = demoSampleCart(nextId).map(line => ({ ...line, imageUrl: "data:image/jpeg;base64,AAAA" }));
  const roundTrip = parseStoredCart(serializeCart(lines));
  assert.equal(roundTrip.length, 3);
  assert.equal(roundTrip[0].imageUrl, null, "data URL grande não é duplicada no armazenamento");
  assert.equal(parseStoredAddress("não é json"), null);
  const address = parseStoredAddress(JSON.stringify({ ...demoSampleAddress, latitude: "x" }));
  assert.equal(address?.latitude, null);
  assert.equal(address?.street, "Rua das Flores");
});

test("Vitrine: endereço enviado ao pedido mantém o formato gravado pelo fluxo por CEP", () => {
  assert.equal(formatAddressForOrder({ ...demoSampleAddress, complement: "Apto 12" }), "Rua das Flores, 123 · Apto 12 · Centro · São Paulo/SP · CEP 01000-000");
});

test("Vitrine: demonstração só fica disponível fora de produção ou com liberação explícita", () => {
  assert.equal(isStorefrontDemoEnabled({ NODE_ENV: "development" }), true);
  assert.equal(isStorefrontDemoEnabled({ NODE_ENV: "production" }), false);
  assert.equal(isStorefrontDemoEnabled({ NODE_ENV: "production", STOREFRONT_DEMO_ENABLED: "true" }), true);
  assert.equal(isStorefrontDemoEnabled({ NODE_ENV: "production", STOREFRONT_DEMO_ENABLED: "1" }), false);
});

test("Vitrine: ícone de categoria é inferido pelo nome real da categoria", () => {
  assert.equal(categoryIconKey("Hambúrgueres"), "burger");
  assert.equal(categoryIconKey("Hot Dogs"), "burger");
  assert.equal(categoryIconKey("Bebidas geladas"), "drink");
  assert.equal(categoryIconKey("Saudáveis"), "healthy");
  assert.equal(categoryIconKey("Categoria nova"), "other");
  assert.equal(categoryIconKey("Pastel"), "pastry");
  assert.equal(categoryIconKey("Pastéis especiais"), "pastry");
  assert.equal(categoryIconKey("Salgados"), "pastry");
  assert.equal(categoryIconKey("Esfihas"), "pastry");
  assert.equal(categoryIconKey("Porções"), "snack");
  assert.equal(categoryIconKey("Massas"), "pasta", "massa não é confundida com pastel");
});
