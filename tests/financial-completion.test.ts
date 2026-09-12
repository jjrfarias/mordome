import assert from "node:assert/strict";
import test from "node:test";
import { adjustLocalStock, addLocalStockEntry, createLocalInventoryItem } from "../lib/local-inventory.ts";
import { openLocalCash, registerLocalCashRefund, registerLocalCashSale, summarizeLocalCash } from "../lib/local-cash.ts";

test("ajustes operacionais registram perda, consumo interno e contagem física", () => {
  const establishmentId = `adjust-${crypto.randomUUID()}`;
  const item = createLocalInventoryItem(establishmentId, { name: `Milho ${crypto.randomUUID()}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: false })!;
  addLocalStockEntry(establishmentId, item.establishmentItemId!, 1, 1000);
  const loss = adjustLocalStock({ establishmentId, establishmentItemId: item.establishmentItemId!, kind: "LOSS", quantity: 100, factorToBase: 1, idempotencyKey: crypto.randomUUID() });
  assert.deepEqual(loss, { delta: -100, balance: 900 });
  const internal = adjustLocalStock({ establishmentId, establishmentItemId: item.establishmentItemId!, kind: "INTERNAL_CONSUMPTION", quantity: 50, factorToBase: 1, idempotencyKey: crypto.randomUUID() });
  assert.deepEqual(internal, { delta: -50, balance: 850 });
  const count = adjustLocalStock({ establishmentId, establishmentItemId: item.establishmentItemId!, kind: "PHYSICAL_COUNT", quantity: 800, factorToBase: 1, idempotencyKey: crypto.randomUUID() });
  assert.deepEqual(count, { delta: -50, balance: 800 });
});

test("pagamento dividido e reembolso afetam cada meio no caixa atual", () => {
  const cash = openLocalCash(`cash-${crypto.randomUUID()}`, `operator-${crypto.randomUUID()}`, 100)!;
  registerLocalCashSale(cash.id, "PIX", 30);
  registerLocalCashSale(cash.id, "CASH", 70);
  assert.equal(summarizeLocalCash(cash).expectedTotal, 200);
  assert.equal(registerLocalCashRefund(cash.id, [{ method: "PIX", amount: 10 }, { method: "CASH", amount: 20 }]), true);
  const summary = summarizeLocalCash(cash);
  assert.equal(summary.expected.PIX, 20);
  assert.equal(summary.expected.CASH, 150);
  assert.equal(summary.expectedTotal, 170);
});
