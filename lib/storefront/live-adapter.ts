import type { HeroSlide, StorefrontData, StorefrontProduct } from "./model.ts";
import { toCents } from "./model.ts";
import { categoryIconKey } from "./catalog.ts";

// Contrato de GET /api/public/orders/[establishmentId]. Valores em reais (Decimal serializado).
export type PublicOrderMenuResponse = {
  establishment: {
    name: string;
    logoUrl: string | null;
    bannerUrl: string | null;
    highlightHeadline: string | null;
    highlightProduct: { id: string; name: string; price: number; imageUrl: string | null } | null;
    phone?: string | null;
    address?: string | null;
  };
  products: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    ingredientGroups?: { id: string; name: string; minSelections: number; maxSelections: number; active: boolean; options: { id: string; name: string; priceDelta: number; active: boolean }[] }[];
  }[];
  deliveryAreas: { id: string; name: string; deliveryFee: number; neighborhoods: string | null }[];
  popularProductIds?: string[];
};

export function mapLiveStorefront(establishmentId: string, response: PublicOrderMenuResponse): StorefrontData {
  const ranking = new Map((response.popularProductIds ?? []).map((productId, index) => [productId, index + 1]));
  const categories: StorefrontData["categories"] = [];
  for (const product of response.products) if (!categories.some(category => category.id === product.category)) categories.push({ id: product.category, name: product.category });

  const products: StorefrontProduct[] = response.products.map(product => ({
    id: product.id,
    name: product.name,
    description: product.description,
    categoryId: product.category,
    priceCents: toCents(product.price),
    compareAtPriceCents: null,
    imageUrl: product.imageUrl,
    rating: null,
    popularityRank: ranking.get(product.id) ?? null,
    vegetarian: false,
    optionGroups: (product.ingredientGroups ?? [])
      .filter(group => group.active)
      .map(group => ({ id: group.id, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, options: group.options.filter(option => option.active).map(option => ({ id: option.id, name: option.name, priceDeltaCents: toCents(option.priceDelta) })) }))
      .filter(group => group.options.length > 0),
  }));

  const { establishment } = response;
  const highlight = establishment.highlightProduct && products.find(product => product.id === establishment.highlightProduct!.id);
  const slideImage = establishment.bannerUrl ?? highlight?.imageUrl ?? null;
  const slides: HeroSlide[] = slideImage ? [{
    id: "vitrine",
    kicker: "Peça online",
    title: establishment.highlightHeadline || establishment.name,
    highlight: highlight ? highlight.name : null,
    description: highlight ? `Adicione ao seu pedido em poucos toques.` : `Escolha no cardápio e receba em casa.`,
    imageUrl: slideImage,
    imageAlt: highlight ? highlight.name : `Destaque de ${establishment.name}`,
    ctaLabel: "Pedir agora",
    target: highlight ? { kind: "product", productId: highlight.id } : { kind: "menu" },
  }] : [];

  // Banner de combos só aparece quando a unidade tem de fato uma categoria de combos com foto; o
  // texto evita alegar economia, que dependeria de preços comparativos não cadastrados.
  const comboCategory = categories.find(category => categoryIconKey(category.name) === "combo");
  const comboImage = comboCategory && products.find(product => product.categoryId === comboCategory.id && product.imageUrl)?.imageUrl;
  const comboPromo: StorefrontData["comboPromo"] = comboCategory && comboImage ? { title: "Combos que combinam com você", text: "Conheça as combinações da casa.", ctaLabel: "Ver combos", imageUrl: comboImage, target: { kind: "category", categoryId: comboCategory.id } } : null;

  return {
    mode: "live",
    storeKey: establishmentId,
    establishment: { name: establishment.name, logoUrl: establishment.logoUrl, phone: establishment.phone ?? null, address: establishment.address ?? null },
    slides,
    categories,
    products,
    deliveryAreas: response.deliveryAreas.map(area => ({ id: area.id, name: area.name, feeCents: toCents(area.deliveryFee), neighborhoods: area.neighborhoods })),
    estimatedDeliveryTime: null,
    pickupSupported: false,
    coupons: null,
    paymentMethods: null,
    comboPromo,
    loyalty: null,
    benefits: [],
    sustainabilityNote: null,
    about: null,
    stores: [],
  };
}
