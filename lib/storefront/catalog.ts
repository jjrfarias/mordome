import type { StorefrontCategory, StorefrontProduct } from "./model.ts";

export type SortKey = "featured" | "popular" | "rating" | "price-asc" | "price-desc" | "name";

export type CatalogFilters = {
  categoryId: string | null;
  query: string;
  sort: SortKey;
  promotionsOnly: boolean;
  vegetarianOnly: boolean;
  favoritesOnly: boolean;
  maxPriceCents: number | null;
};

export const emptyFilters: CatalogFilters = { categoryId: null, query: "", sort: "featured", promotionsOnly: false, vegetarianOnly: false, favoritesOnly: false, maxPriceCents: null };

export function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

export function productMatchesQuery(product: StorefrontProduct, categoryName: string, query: string) {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeSearchText(`${product.name} ${product.description ?? ""} ${categoryName}`);
  return terms.every(term => haystack.includes(term));
}

export function isOnPromotion(product: StorefrontProduct) {
  return product.compareAtPriceCents !== null && product.compareAtPriceCents > product.priceCents;
}

export function discountPercent(product: StorefrontProduct) {
  if (!isOnPromotion(product)) return 0;
  return Math.round((1 - product.priceCents / product.compareAtPriceCents!) * 100);
}

// Os atalhos só aparecem quando existem dados reais que os sustentem.
export function availableQuickFilters(products: StorefrontProduct[]) {
  return {
    popular: products.some(product => product.popularityRank !== null),
    rating: products.some(product => product.rating !== null && product.rating.count > 0),
    promotions: products.some(isOnPromotion),
    vegetarian: products.some(product => product.vegetarian),
  };
}

export function productBadge(product: StorefrontProduct) {
  if (product.popularityRank === 1) return "Mais pedido";
  if (isOnPromotion(product)) return "Oferta";
  return null;
}

const byName = (a: StorefrontProduct, b: StorefrontProduct) => a.name.localeCompare(b.name, "pt-BR");

function compareBy(sort: SortKey, order: Map<string, number>) {
  return (a: StorefrontProduct, b: StorefrontProduct) => {
    switch (sort) {
      case "popular": return (a.popularityRank ?? Number.MAX_SAFE_INTEGER) - (b.popularityRank ?? Number.MAX_SAFE_INTEGER) || order.get(a.id)! - order.get(b.id)!;
      case "rating": return (b.rating?.average ?? -1) - (a.rating?.average ?? -1) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0) || byName(a, b);
      case "price-asc": return a.priceCents - b.priceCents || byName(a, b);
      case "price-desc": return b.priceCents - a.priceCents || byName(a, b);
      case "name": return byName(a, b);
      default: return order.get(a.id)! - order.get(b.id)!;
    }
  };
}

export function selectProducts(products: StorefrontProduct[], categories: StorefrontCategory[], filters: CatalogFilters, favoriteIds: ReadonlySet<string> = new Set()) {
  const categoryNames = new Map(categories.map(category => [category.id, category.name]));
  const order = new Map(products.map((product, index) => [product.id, index]));
  return products
    .filter(product => filters.categoryId === null || product.categoryId === filters.categoryId)
    .filter(product => productMatchesQuery(product, categoryNames.get(product.categoryId) ?? "", filters.query))
    .filter(product => !filters.promotionsOnly || isOnPromotion(product))
    .filter(product => !filters.vegetarianOnly || product.vegetarian)
    .filter(product => !filters.favoritesOnly || favoriteIds.has(product.id))
    .filter(product => filters.maxPriceCents === null || product.priceCents <= filters.maxPriceCents)
    .sort(compareBy(filters.sort, order));
}

export function hasActiveRefinements(filters: CatalogFilters) {
  return filters.categoryId !== null || filters.query.trim() !== "" || filters.promotionsOnly || filters.vegetarianOnly || filters.favoritesOnly || filters.maxPriceCents !== null;
}

export type CategoryIconKey = "pizza" | "burger" | "pasta" | "drink" | "dessert" | "combo" | "healthy" | "pastry" | "snack" | "other";

const categoryIconRules: [CategoryIconKey, RegExp][] = [
  ["pizza", /pizz/],
  ["burger", /hamb|burg|lanche|sanduic|hot ?dog|dog/],
  ["pasta", /mass|macarr|penne|espaguet|lasanh|risot/],
  ["drink", /bebid|refri|suco|drink|cerve|agua|cafe/],
  ["dessert", /sobremes|doce|sorvet|bolo|acai/],
  ["combo", /combo|kit|promo/],
  ["healthy", /saudav|salad|fit|vegan|vegetar|bowl|light/],
  ["pastry", /pastel|pasteis|salgad|coxinh|esfi(h|r)|empad|empanad|quiche/],
  ["snack", /porc|petisc|entrada|batata/],
];

export function categoryIconKey(name: string): CategoryIconKey {
  const normalized = normalizeSearchText(name);
  return categoryIconRules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "other";
}

// Ranking de "mais pedidos" a partir de pedidos reais. Um único pedido não transforma um produto em
// "mais pedido": exige volume mínimo para não exibir popularidade que os dados não sustentam.
export function rankPopularProducts(items: { productId: string | null; quantity: number }[], options: { minQuantity?: number; limit?: number } = {}) {
  const minQuantity = options.minQuantity ?? 5;
  const limit = options.limit ?? 12;
  const totals = new Map<string, number>();
  for (const item of items) if (item.productId) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  return [...totals.entries()]
    .filter(([, quantity]) => quantity >= minQuantity)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([productId]) => productId);
}
