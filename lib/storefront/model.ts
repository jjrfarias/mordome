// Modelo da vitrine de pedido online (ADR 0056). Todos os valores monetários estão em centavos
// inteiros: o navegador só apresenta prévias — preço, taxa e total aceitos vêm sempre do servidor.

export type StorefrontOption = { id: string; name: string; priceDeltaCents: number };
export type StorefrontOptionGroup = { id: string; name: string; minSelections: number; maxSelections: number; options: StorefrontOption[] };

export type StorefrontProduct = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  priceCents: number;
  // Somente dados configurados no sistema: sem cadastro, os campos ficam nulos e a interface omite
  // preço anterior, avaliação e selos em vez de inventá-los.
  compareAtPriceCents: number | null;
  imageUrl: string | null;
  rating: { average: number; count: number } | null;
  popularityRank: number | null;
  vegetarian: boolean;
  optionGroups: StorefrontOptionGroup[];
};

export type StorefrontCategory = { id: string; name: string };

export type StorefrontTarget = { kind: "category"; categoryId: string } | { kind: "product"; productId: string } | { kind: "menu" };

export type HeroSlide = {
  id: string;
  kicker: string | null;
  title: string;
  highlight: string | null;
  description: string | null;
  imageUrl: string;
  imageAlt: string;
  ctaLabel: string;
  target: StorefrontTarget;
};

export type DeliveryAreaInfo = { id: string; name: string; feeCents: number; neighborhoods: string | null };

export type StorefrontCoupon = { code: string; kind: "PERCENT" | "FIXED"; value: number; minSubtotalCents: number };

export type BenefitIcon = "food" | "delivery" | "payment" | "support";

export type StorefrontData = {
  mode: "live" | "demo";
  // Chave de isolamento do carrinho e dos favoritos no navegador: um estabelecimento nunca lê o
  // carrinho de outro.
  storeKey: string;
  branding: { name: string; logoUrl: string | null; primary: string; accent: string };
  establishment: { name: string; logoUrl: string | null; phone: string | null; address: string | null };
  slides: HeroSlide[];
  categories: StorefrontCategory[];
  products: StorefrontProduct[];
  deliveryAreas: DeliveryAreaInfo[];
  estimatedDeliveryTime: string | null;
  // O POST público atual só registra entregas; retirada depende de suporte no backend.
  pickupSupported: boolean;
  // null = recurso sem integração: a interface não mostra o campo de cupom.
  coupons: StorefrontCoupon[] | null;
  // null = forma de pagamento combinada com o estabelecimento na confirmação (pedido online atual).
  paymentMethods: string[] | null;
  comboPromo: { title: string; text: string; ctaLabel: string; imageUrl: string; target: StorefrontTarget } | null;
  loyalty: { title: string; text: string; ctaLabel: string; details: string[] } | null;
  benefits: { icon: BenefitIcon; title: string; text: string }[];
  sustainabilityNote: string | null;
  about: string | null;
  stores: { name: string; address: string; hours: string }[];
};

export type DeliveryAddress = {
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  // Região escolhida manualmente quando as áreas da unidade não têm bairros cadastrados.
  areaId: string | null;
};

export function toCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100);
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number) {
  return currency.format(cents / 100);
}

export function formatAddressLines(address: DeliveryAddress) {
  const first = [address.street, address.number].filter(Boolean).join(", ") + (address.complement ? ` · ${address.complement}` : "");
  const second = [address.neighborhood, [address.city, address.state].filter(Boolean).join(" - ")].filter(Boolean).join(", ");
  return { first, second };
}

// Mesmo formato textual gravado por `DeliveryOrder.address` desde o fluxo por CEP (ADR 0051).
export function formatAddressForOrder(address: DeliveryAddress) {
  return [address.street && `${address.street}, ${address.number}`, address.complement, address.neighborhood, address.city && `${address.city}/${address.state}`, address.postalCode && `CEP ${address.postalCode}`].filter(Boolean).join(" · ");
}
