import assert from "node:assert/strict";
import test from "node:test";
import { validateCoupon, normalizeCouponCode, type CouponRecord } from "../lib/coupons.ts";
import { createLocalCoupon, findLocalCouponByCode, listLocalCoupons, redeemLocalCoupon, updateLocalCoupon, listLocalCouponRedemptions } from "../lib/local-coupons.ts";
import { buildCouponsGeneratedRows, summarizeCouponsGenerated, type CouponGeneratedRecord, type CouponRedemptionRecord } from "../lib/reports/coupons-generated.ts";

const baseCoupon = (overrides: Partial<CouponRecord> = {}): CouponRecord => ({
  id: "coupon-1",
  code: "BEMVINDO10",
  discountType: "PERCENT",
  discountValue: 10,
  validFrom: null,
  validUntil: null,
  maxUses: null,
  usesCount: 0,
  active: true,
  ...overrides,
});

test("Cupons: criação com código duplicado na mesma organização é rejeitada", () => {
  const organizationId = `coupon-dup-${Date.now()}`;
  const created = createLocalCoupon(organizationId, { code: "PROMO10", discountType: "PERCENT", discountValue: 10, validFrom: null, validUntil: null, maxUses: null });
  assert.notEqual(created, "DUPLICATE");
  const duplicate = createLocalCoupon(organizationId, { code: "promo10", discountType: "FIXED", discountValue: 5, validFrom: null, validUntil: null, maxUses: null });
  assert.equal(duplicate, "DUPLICATE");
});

test("Cupons: código é normalizado para maiúsculas ao criar e ao buscar", () => {
  const organizationId = `coupon-normalize-${Date.now()}`;
  createLocalCoupon(organizationId, { code: "descontao", discountType: "FIXED", discountValue: 15, validFrom: null, validUntil: null, maxUses: null });
  const found = findLocalCouponByCode(organizationId, "DESCONTAO");
  assert.ok(found);
  assert.equal(found?.code, "DESCONTAO");
  assert.equal(normalizeCouponCode(" descontao "), "DESCONTAO");
});

test("Validação de cupom: cupom inexistente é rejeitado", () => {
  const result = validateCoupon(null, 100);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "NOT_FOUND");
});

test("Validação de cupom: cupom inativo é rejeitado", () => {
  const result = validateCoupon(baseCoupon({ active: false }), 100);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "INACTIVE");
});

test("Validação de cupom: fora da janela de validade é rejeitado (ainda não válido e expirado)", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const notYet = validateCoupon(baseCoupon({ validFrom: future }), 100);
  assert.equal(notYet.ok, false);
  if (!notYet.ok) assert.equal(notYet.error, "NOT_YET_VALID");
  const expired = validateCoupon(baseCoupon({ validUntil: past }), 100);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.error, "EXPIRED");
});

test("Validação de cupom: limite de usos atingido é rejeitado", () => {
  const result = validateCoupon(baseCoupon({ maxUses: 2, usesCount: 2 }), 100);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "USES_EXCEEDED");
});

test("Validação de cupom: dentro do limite de usos é aceito", () => {
  const result = validateCoupon(baseCoupon({ maxUses: 2, usesCount: 1 }), 100);
  assert.equal(result.ok, true);
});

test("Aplicação do desconto: percentual calcula sobre o subtotal, fixo aplica o valor direto", () => {
  const percent = validateCoupon(baseCoupon({ discountType: "PERCENT", discountValue: 10 }), 200);
  assert.equal(percent.ok, true);
  if (percent.ok) assert.equal(percent.discount, 20);

  const fixed = validateCoupon(baseCoupon({ discountType: "FIXED", discountValue: 15 }), 200);
  assert.equal(fixed.ok, true);
  if (fixed.ok) assert.equal(fixed.discount, 15);
});

test("Aplicação do desconto: nunca supera o subtotal (cupom fixo maior que o carrinho)", () => {
  const result = validateCoupon(baseCoupon({ discountType: "FIXED", discountValue: 500 }), 100);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.discount, 100);
});

test("Cupons (modo local): resgate incrementa usesCount e cria registro de uso consultado pelo relatório", () => {
  const organizationId = `coupon-redeem-${Date.now()}`;
  const coupon = createLocalCoupon(organizationId, { code: "USO10", discountType: "PERCENT", discountValue: 10, validFrom: null, validUntil: null, maxUses: null });
  if (coupon === "DUPLICATE") throw new Error("unexpected");
  redeemLocalCoupon(organizationId, coupon.id, { saleId: "sale-1", establishmentId: "est-1", discountApplied: 10 });
  const afterOne = findLocalCouponByCode(organizationId, coupon.code);
  assert.equal(afterOne?.usesCount, 1);
  redeemLocalCoupon(organizationId, coupon.id, { saleId: "sale-2", establishmentId: "est-1", discountApplied: 12 });
  const afterTwo = findLocalCouponByCode(organizationId, coupon.code);
  assert.equal(afterTwo?.usesCount, 2);
  const redemptions = listLocalCouponRedemptions(coupon.id);
  assert.equal(redemptions.length, 2);
});

test("Cupons (modo local): inativação não exclui o cupom, mesmo padrão dos demais cadastros", () => {
  const organizationId = `coupon-inactivate-${Date.now()}`;
  const coupon = createLocalCoupon(organizationId, { code: "SAIR20", discountType: "FIXED", discountValue: 20, validFrom: null, validUntil: null, maxUses: null });
  if (coupon === "DUPLICATE") throw new Error("unexpected");
  const updated = updateLocalCoupon(organizationId, coupon.id, { active: false });
  assert.notEqual(updated, "NOT_FOUND"); if (typeof updated === "string") return;
  assert.equal(updated.active, false);
  const listed = listLocalCoupons(organizationId).find(item => item.id === coupon.id);
  assert.ok(listed);
  assert.equal(listed?.active, false);
});

test("Isolamento: cupons de uma organização não aparecem para outra", () => {
  const organizationId = `coupon-iso-a-${Date.now()}`;
  const otherOrganizationId = `coupon-iso-b-${Date.now()}`;
  createLocalCoupon(organizationId, { code: "ISOLADO", discountType: "PERCENT", discountValue: 5, validFrom: null, validUntil: null, maxUses: null });
  assert.equal(listLocalCoupons(otherOrganizationId).length, 0);
  assert.equal(listLocalCoupons(organizationId).length, 1);
  assert.equal(findLocalCouponByCode(otherOrganizationId, "ISOLADO"), null);
});

test("Relatório de cupons gerados: agrega usos e desconto do período por cupom, cupom sem uso no período aparece com zero", () => {
  const coupons: CouponGeneratedRecord[] = [
    { id: "c1", code: "ABC10", discountType: "PERCENT", discountValue: 10, validFrom: null, validUntil: null, maxUses: null, usesCount: 5, createdAt: new Date("2026-01-01").toISOString() },
    { id: "c2", code: "SEMUSO", discountType: "FIXED", discountValue: 10, validFrom: null, validUntil: null, maxUses: 10, usesCount: 0, createdAt: new Date("2026-01-05").toISOString() },
  ];
  const redemptions: CouponRedemptionRecord[] = [
    { couponId: "c1", discountApplied: 10 },
    { couponId: "c1", discountApplied: 15 },
  ];
  const rows = buildCouponsGeneratedRows(coupons, redemptions);
  assert.equal(rows.length, 2);
  const abc = rows.find(row => row.code === "ABC10")!;
  assert.equal(abc.usesInPeriod, 2);
  assert.equal(abc.discountAppliedInPeriod, 25);
  assert.equal(abc.usesCountTotal, 5);
  const semUso = rows.find(row => row.code === "SEMUSO")!;
  assert.equal(semUso.usesInPeriod, 0);
  assert.equal(semUso.discountAppliedInPeriod, 0);

  const summary = summarizeCouponsGenerated(rows);
  assert.equal(summary.couponsCount, 2);
  assert.equal(summary.usesInPeriod, 2);
  assert.equal(summary.discountAppliedInPeriod, 25);
});

test("Relatório de cupons gerados: sem cupons cadastrados até o período não gera linhas", () => {
  const rows = buildCouponsGeneratedRows([], []);
  assert.equal(rows.length, 0);
  assert.equal(summarizeCouponsGenerated(rows).couponsCount, 0);
});
