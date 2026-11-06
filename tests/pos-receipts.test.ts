import test from "node:test";
import assert from "node:assert/strict";
import { receiptPlan } from "../lib/pos-receipts.ts";
const rule = { feeRate: "2.99", settlementDays: 30, businessDays: false, holidays: [] as string[] };
test("recebível líquido em centavos, arredondando taxa somente no final", () => {
  assert.deepEqual(receiptPlan("100.00", "2026-11-06T15:00:00Z", rule), { grossCents: 10000, feeCents: 299, netCents: 9701, dueDate: "2026-12-06" });
  assert.equal(receiptPlan("0.50", "2026-11-06", { ...rule, feeRate: "1.00" }).feeCents, 1);
  assert.equal(receiptPlan("9999999999.99", "2026-11-06", { ...rule, feeRate: "99.99" }).feeCents, 999899999999);
});
test("prazo respeita dia brasileiro, fins de semana e feriados configurados", () => {
  const days = { ...rule, settlementDays: 1, businessDays: true, holidays: ["2026-11-09"] };
  assert.equal(receiptPlan("10.00", "2026-11-07T01:00:00Z", days).dueDate, "2026-11-10");
  assert.equal(receiptPlan("10.00", "2026-11-07T15:00:00Z", { ...days, settlementDays: 0 }).dueDate, "2026-11-10");
  assert.equal(receiptPlan("10.00", "2026-12-31T15:00:00Z", { ...rule, settlementDays: 1 }).dueDate, "2027-01-01");
});
test("taxas, prazos e datas inválidas nunca geram um recebível aproximado", () => {
  for (const override of [{ feeRate: "100" }, { feeRate: "-1" }, { feeRate: "1.234" }, { settlementDays: -1 }, { settlementDays: 1.5 }, { holidays: ["2026-02-30"] }]) assert.throws(() => receiptPlan("10.00", "2026-11-06", { ...rule, ...override }));
});
