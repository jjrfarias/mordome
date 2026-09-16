// Validação/aplicação de cupom de desconto (ver ADR 0041). Função pura, compartilhada pela rota
// de validação (`app/api/operations/coupons/validate/route.ts`) e pela finalização de venda
// (`app/api/operations/sales/route.ts`, modo Prisma e modo local): dado um cupom (ou `null`, se
// não encontrado) e o subtotal atual do carrinho, decide se o cupom pode ser usado agora e calcula
// o valor de desconto resultante. Não conhece Prisma nem o modo local — cada lado busca o cupom do
// seu próprio armazenamento e chama esta função com os mesmos campos.

export type CouponDiscountType = "PERCENT" | "FIXED";

export type CouponRecord = {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  validFrom: string | null; // ISO
  validUntil: string | null; // ISO
  maxUses: number | null;
  usesCount: number;
  active: boolean;
};

export type CouponValidationError = "NOT_FOUND" | "INACTIVE" | "NOT_YET_VALID" | "EXPIRED" | "USES_EXCEEDED" | "INVALID_SUBTOTAL";

export type CouponValidationResult =
  | { ok: true; coupon: CouponRecord; discount: number }
  | { ok: false; error: CouponValidationError };

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const COUPON_VALIDATION_MESSAGES: Record<CouponValidationError, string> = {
  NOT_FOUND: "Cupom não encontrado.",
  INACTIVE: "Este cupom está inativo.",
  NOT_YET_VALID: "Este cupom ainda não está válido.",
  EXPIRED: "Este cupom expirou.",
  USES_EXCEEDED: "Este cupom já atingiu o limite de usos.",
  INVALID_SUBTOTAL: "O carrinho está vazio.",
};

// Calcula o desconto do cupom sobre `subtotal` (o valor antes do desconto), sem nunca superar o
// próprio subtotal nem ficar negativo. Não altera `usesCount` — isso é feito separadamente,
// no momento em que a venda é efetivamente concluída (ver decisão do ADR 0041).
export function validateCoupon(coupon: CouponRecord | null, subtotal: number, now: Date = new Date()): CouponValidationResult {
  if (!coupon) return { ok: false, error: "NOT_FOUND" };
  if (!Number.isFinite(subtotal) || subtotal <= 0) return { ok: false, error: "INVALID_SUBTOTAL" };
  if (!coupon.active) return { ok: false, error: "INACTIVE" };
  if (coupon.validFrom && now.getTime() < new Date(coupon.validFrom).getTime()) return { ok: false, error: "NOT_YET_VALID" };
  if (coupon.validUntil && now.getTime() > new Date(coupon.validUntil).getTime()) return { ok: false, error: "EXPIRED" };
  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) return { ok: false, error: "USES_EXCEEDED" };
  const raw = coupon.discountType === "PERCENT" ? subtotal * (coupon.discountValue / 100) : coupon.discountValue;
  const discount = round(Math.min(Math.max(raw, 0), subtotal));
  return { ok: true, coupon, discount };
}

export const normalizeCouponCode = (code: string) => code.trim().toLocaleUpperCase("pt-BR");
