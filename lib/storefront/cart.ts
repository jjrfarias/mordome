import type { StorefrontCoupon, StorefrontProduct } from "./model.ts";
import { formatCents } from "./model.ts";

export type OptionSelection = { groupId: string; optionIds: string[] };

export type CartLine = {
  lineId: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  selections: OptionSelection[];
  optionLabels: string[];
};

export const MAX_LINE_QUANTITY = 99;
const CART_STORAGE_VERSION = 1;

export function cartStorageKey(storeKey: string) {
  return `mordome:pedido-online:carrinho:v${CART_STORAGE_VERSION}:${storeKey}`;
}

export function favoritesStorageKey(storeKey: string) {
  return `mordome:pedido-online:favoritos:v1:${storeKey}`;
}

function normalizedSelections(selections: OptionSelection[]) {
  return selections.filter(selection => selection.optionIds.length > 0).map(selection => ({ groupId: selection.groupId, optionIds: [...selection.optionIds].sort() })).sort((a, b) => a.groupId.localeCompare(b.groupId));
}

function lineSignature(productId: string, selections: OptionSelection[]) {
  return `${productId}|${JSON.stringify(normalizedSelections(selections))}`;
}

export function productRequiresChoice(product: StorefrontProduct) {
  return product.optionGroups.some(group => group.options.length > 0);
}

export type PricedSelection = { ok: true; unitPriceCents: number; labels: string[]; selections: OptionSelection[] } | { ok: false; error: string };

// Mesma regra de mínimo/máximo aplicada pelo servidor (`resolveIngredientSelections`); aqui é só
// feedback imediato, o preço final é sempre recalculado na API.
export function priceSelection(product: StorefrontProduct, selections: OptionSelection[]): PricedSelection {
  const chosen = new Map(normalizedSelections(selections).map(selection => [selection.groupId, selection.optionIds]));
  for (const groupId of chosen.keys()) if (!product.optionGroups.some(group => group.id === groupId)) return { ok: false, error: "Uma das opções escolhidas não está mais disponível." };
  let unitPriceCents = product.priceCents;
  const labels: string[] = [];
  for (const group of product.optionGroups) {
    const optionIds = chosen.get(group.id) ?? [];
    if (optionIds.length < group.minSelections) return { ok: false, error: group.minSelections === 1 ? `Escolha uma opção em "${group.name}".` : `Escolha ao menos ${group.minSelections} opções em "${group.name}".` };
    if (optionIds.length > group.maxSelections) return { ok: false, error: `Escolha no máximo ${group.maxSelections} opções em "${group.name}".` };
    for (const optionId of optionIds) {
      const option = group.options.find(candidate => candidate.id === optionId);
      if (!option) return { ok: false, error: "Uma das opções escolhidas não está mais disponível." };
      unitPriceCents += option.priceDeltaCents;
      labels.push(option.name);
    }
  }
  return { ok: true, unitPriceCents, labels, selections: normalizedSelections(selections) };
}

export function addToCart(lines: CartLine[], product: StorefrontProduct, priced: Extract<PricedSelection, { ok: true }>, quantity: number, createId: () => string): CartLine[] {
  const signature = lineSignature(product.id, priced.selections);
  const existing = lines.find(line => lineSignature(line.productId, line.selections) === signature);
  if (existing) return lines.map(line => line === existing ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + quantity), unitPriceCents: priced.unitPriceCents } : line);
  return [...lines, { lineId: createId(), productId: product.id, name: product.name, imageUrl: product.imageUrl, unitPriceCents: priced.unitPriceCents, quantity: Math.min(MAX_LINE_QUANTITY, quantity), selections: priced.selections, optionLabels: priced.labels }];
}

export function changeLineQuantity(lines: CartLine[], lineId: string, delta: number) {
  const target = lines.find(line => line.lineId === lineId);
  if (!target) return { lines, removed: null };
  const quantity = Math.min(MAX_LINE_QUANTITY, target.quantity + delta);
  if (quantity <= 0) return { lines: lines.filter(line => line.lineId !== lineId), removed: { line: target, index: lines.indexOf(target) } };
  return { lines: lines.map(line => line.lineId === lineId ? { ...line, quantity } : line), removed: null };
}

export function restoreLine(lines: CartLine[], line: CartLine, index: number) {
  if (lines.some(candidate => candidate.lineId === line.lineId)) return lines;
  const next = [...lines];
  next.splice(Math.min(index, next.length), 0, line);
  return next;
}

export const cartUnits = (lines: CartLine[]) => lines.reduce((sum, line) => sum + line.quantity, 0);
export const cartSubtotalCents = (lines: CartLine[]) => lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);

export type CouponResult = { ok: true; code: string; discountCents: number } | { ok: false; error: string };

export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function evaluateCoupon(code: string, coupons: StorefrontCoupon[], subtotalCents: number): CouponResult {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return { ok: false, error: "Informe o código do cupom." };
  const coupon = coupons.find(candidate => normalizeCouponCode(candidate.code) === normalized);
  if (!coupon) return { ok: false, error: "Cupom inválido ou expirado." };
  if (subtotalCents < coupon.minSubtotalCents) return { ok: false, error: `Válido para pedidos a partir de ${formatCents(coupon.minSubtotalCents)}.` };
  const raw = coupon.kind === "PERCENT" ? Math.round(subtotalCents * coupon.value / 100) : coupon.value;
  return { ok: true, code: normalized, discountCents: Math.max(0, Math.min(subtotalCents, raw)) };
}

export function orderTotals(input: { subtotalCents: number; discountCents: number; deliveryFeeCents: number | null }) {
  const discountCents = Math.max(0, Math.min(input.subtotalCents, input.discountCents));
  return { subtotalCents: input.subtotalCents, discountCents, deliveryFeeCents: input.deliveryFeeCents, totalCents: input.subtotalCents - discountCents + (input.deliveryFeeCents ?? 0), totalIsFinal: input.deliveryFeeCents !== null };
}

// Revalida o carrinho salvo contra o catálogo atual: remove itens indisponíveis ou com opções que
// deixaram de existir e atualiza preços, sempre avisando o cliente do que mudou.
export function reconcileCart(lines: CartLine[], products: StorefrontProduct[]) {
  const notices: string[] = [];
  const next: CartLine[] = [];
  for (const line of lines) {
    const product = products.find(candidate => candidate.id === line.productId);
    if (!product) { notices.push(`${line.name} não está mais disponível e saiu do seu pedido.`); continue; }
    const priced = priceSelection(product, line.selections);
    if (!priced.ok) { notices.push(`${line.name} mudou e precisa ser escolhido novamente.`); continue; }
    if (priced.unitPriceCents !== line.unitPriceCents) notices.push(`O preço de ${product.name} mudou para ${formatCents(priced.unitPriceCents)}.`);
    next.push({ ...line, name: product.name, imageUrl: product.imageUrl, unitPriceCents: priced.unitPriceCents, optionLabels: priced.labels });
  }
  return { lines: next, notices };
}

const isString = (value: unknown): value is string => typeof value === "string";

// O conteúdo do localStorage é entrada não confiável: qualquer formato inesperado é descartado.
export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): CartLine[] => {
      if (!value || typeof value !== "object") return [];
      const line = value as Record<string, unknown>;
      if (!isString(line.lineId) || !isString(line.productId) || !isString(line.name)) return [];
      if (!Number.isInteger(line.unitPriceCents) || !Number.isInteger(line.quantity) || (line.quantity as number) < 1) return [];
      const selections = Array.isArray(line.selections) ? line.selections.flatMap((selection): OptionSelection[] => {
        if (!selection || typeof selection !== "object") return [];
        const item = selection as Record<string, unknown>;
        return isString(item.groupId) && Array.isArray(item.optionIds) && item.optionIds.every(isString) ? [{ groupId: item.groupId, optionIds: item.optionIds as string[] }] : [];
      }) : [];
      return [{ lineId: line.lineId, productId: line.productId, name: line.name, imageUrl: isString(line.imageUrl) ? line.imageUrl : null, unitPriceCents: line.unitPriceCents as number, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity as number), selections, optionLabels: Array.isArray(line.optionLabels) ? line.optionLabels.filter(isString) : [] }];
    });
  } catch {
    return [];
  }
}

// Imagens da vitrine podem ser data URLs grandes (ADR 0053); não duplicá-las no armazenamento local.
export function serializeCart(lines: CartLine[]) {
  return JSON.stringify(lines.map(line => ({ ...line, imageUrl: line.imageUrl?.startsWith("data:") ? null : line.imageUrl })));
}
