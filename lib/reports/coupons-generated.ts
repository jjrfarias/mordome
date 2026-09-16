// Cálculo puro do relatório "Cupons gerados" (ADR 0041). Diferente de todo relatório anterior da
// série (que filtra um EVENTO — venda, consumo, etc. — pelo período), este relatório lista TODOS
// os cupons já cadastrados até o fim do período consultado ("gerados" = criados, não "usados"),
// e para cada um soma quantos usos (`CouponRedemption`) caíram DENTRO do período além do total
// histórico (`Coupon.usesCount`, que nunca é filtrado por período). Mesmo padrão do framework:
// puro, sem Prisma/Next, testável isoladamente com `node --test`.

export type CouponDiscountType = "PERCENT" | "FIXED";

export type CouponGeneratedRecord = {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  usesCount: number; // total histórico, não filtrado por período
  createdAt: string;
};

// Um resgate já filtrado na origem para o cupom em questão (a rota busca só os resgates do
// período, por cupom).
export type CouponRedemptionRecord = {
  couponId: string;
  discountApplied: number;
};

export type CouponGeneratedRow = {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  usesCountTotal: number;
  usesInPeriod: number;
  discountAppliedInPeriod: number;
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// `coupons` já deve vir filtrado por `createdAt <= to` (todos os cupons cadastrados até o fim do
// período) e `redemptionsInPeriod` já filtrado por `createdAt` dentro de `[from, to]`. Ordenado por
// código, sem ranking (não faz sentido "ranquear" cupons por uso aqui — é um cadastro, não um
// ranking de vendas).
export function buildCouponsGeneratedRows(coupons: CouponGeneratedRecord[], redemptionsInPeriod: CouponRedemptionRecord[]): CouponGeneratedRow[] {
  const byCoupon = new Map<string, { usesInPeriod: number; discountAppliedInPeriod: number }>();
  for (const redemption of redemptionsInPeriod) {
    const current = byCoupon.get(redemption.couponId) ?? { usesInPeriod: 0, discountAppliedInPeriod: 0 };
    current.usesInPeriod += 1;
    current.discountAppliedInPeriod = round(current.discountAppliedInPeriod + redemption.discountApplied);
    byCoupon.set(redemption.couponId, current);
  }

  return [...coupons]
    .sort((a, b) => a.code.localeCompare(b.code, "pt-BR"))
    .map(coupon => {
      const usage = byCoupon.get(coupon.id) ?? { usesInPeriod: 0, discountAppliedInPeriod: 0 };
      return {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        validFrom: coupon.validFrom,
        validUntil: coupon.validUntil,
        maxUses: coupon.maxUses,
        usesCountTotal: coupon.usesCount,
        usesInPeriod: usage.usesInPeriod,
        discountAppliedInPeriod: usage.discountAppliedInPeriod,
      };
    });
}

export type CouponsGeneratedSummary = {
  couponsCount: number;
  usesInPeriod: number;
  discountAppliedInPeriod: number;
};

export function summarizeCouponsGenerated(rows: CouponGeneratedRow[]): CouponsGeneratedSummary {
  return rows.reduce((acc, row) => ({
    couponsCount: acc.couponsCount + 1,
    usesInPeriod: acc.usesInPeriod + row.usesInPeriod,
    discountAppliedInPeriod: round(acc.discountAppliedInPeriod + row.discountAppliedInPeriod),
  }), { couponsCount: 0, usesInPeriod: 0, discountAppliedInPeriod: 0 });
}
