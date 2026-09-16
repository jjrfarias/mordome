import { randomUUID } from "node:crypto";
import type { CouponDiscountType } from "./coupons.ts";

// Cadastro de cupons de desconto em modo local (ver ADR 0041) — mesmo padrão em memória de
// `lib/local-cancellation-reasons.ts`. Escopo por organização, código único por organização
// (comparação normalizada, ver `normalizeCouponCode`).
export type LocalCoupon = {
  id: string;
  organizationId: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
  createdAt: string;
};

export type LocalCouponRedemption = {
  id: string;
  couponId: string;
  saleId: string;
  establishmentId: string;
  discountApplied: number;
  createdAt: string;
};

const couponsByOrganization = new Map<string, LocalCoupon[]>();
const redemptions: LocalCouponRedemption[] = [];

function bucket(organizationId: string) {
  if (!couponsByOrganization.has(organizationId)) couponsByOrganization.set(organizationId, []);
  return couponsByOrganization.get(organizationId)!;
}

const sameCode = (a: string, b: string) => a.trim().toLocaleUpperCase("pt-BR") === b.trim().toLocaleUpperCase("pt-BR");

export function listLocalCoupons(organizationId: string): LocalCoupon[] {
  return bucket(organizationId).map(coupon => ({ ...coupon }));
}

export function findLocalCouponByCode(organizationId: string, code: string): LocalCoupon | null {
  const found = bucket(organizationId).find(coupon => sameCode(coupon.code, code));
  return found ? { ...found } : null;
}

export function createLocalCoupon(organizationId: string, data: { code: string; discountType: CouponDiscountType; discountValue: number; validFrom: string | null; validUntil: string | null; maxUses: number | null }): LocalCoupon | "DUPLICATE" {
  const list = bucket(organizationId);
  if (list.some(coupon => sameCode(coupon.code, data.code))) return "DUPLICATE" as const;
  const coupon: LocalCoupon = {
    id: `local-coupon-${randomUUID()}`,
    organizationId,
    code: data.code.trim().toLocaleUpperCase("pt-BR"),
    discountType: data.discountType,
    discountValue: data.discountValue,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    maxUses: data.maxUses,
    usesCount: 0,
    active: true,
    createdAt: new Date().toISOString(),
  };
  list.push(coupon);
  return { ...coupon };
}

export function updateLocalCoupon(organizationId: string, couponId: string, data: { active?: boolean; discountValue?: number; validFrom?: string | null; validUntil?: string | null; maxUses?: number | null }): LocalCoupon | "NOT_FOUND" {
  const list = bucket(organizationId);
  const coupon = list.find(item => item.id === couponId);
  if (!coupon) return "NOT_FOUND" as const;
  if (data.active !== undefined) coupon.active = data.active;
  if (data.discountValue !== undefined) coupon.discountValue = data.discountValue;
  if (data.validFrom !== undefined) coupon.validFrom = data.validFrom;
  if (data.validUntil !== undefined) coupon.validUntil = data.validUntil;
  if (data.maxUses !== undefined) coupon.maxUses = data.maxUses;
  return { ...coupon };
}

// Registra o uso do cupom em uma venda concluída: incrementa `usesCount` e cria o registro de
// resgate consultado pelo relatório "Cupons gerados". Chamado só depois que a venda já foi
// efetivamente concluída (evita incrementar por uma validação que não virou venda).
export function redeemLocalCoupon(organizationId: string, couponId: string, input: { saleId: string; establishmentId: string; discountApplied: number }): LocalCouponRedemption | "NOT_FOUND" {
  const coupon = bucket(organizationId).find(item => item.id === couponId);
  if (!coupon) return "NOT_FOUND" as const;
  coupon.usesCount += 1;
  const redemption: LocalCouponRedemption = { id: `local-coupon-redemption-${randomUUID()}`, couponId, saleId: input.saleId, establishmentId: input.establishmentId, discountApplied: input.discountApplied, createdAt: new Date().toISOString() };
  redemptions.push(redemption);
  return { ...redemption };
}

export function listLocalCouponRedemptions(couponId: string, from?: Date, to?: Date): LocalCouponRedemption[] {
  return redemptions
    .filter(item => item.couponId === couponId)
    .filter(item => !from || !to || (new Date(item.createdAt) >= from && new Date(item.createdAt) <= to))
    .map(item => ({ ...item }));
}
