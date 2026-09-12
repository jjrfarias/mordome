import assert from "node:assert/strict";
import test from "node:test";
import {
  closeLocalCash,
  getLocalOpenCashSession,
  listLocalCashHistory,
  moveLocalCash,
  openLocalCash,
  registerLocalCashSale,
  summarizeLocalCash,
} from "../lib/local-cash.ts";

test("caixa aberto e isolado por unidade e operador", () => {
  const suffix = Date.now().toString();
  const first = openLocalCash(`unit-a-${suffix}`, `operator-a-${suffix}`, 100);

  assert.ok(first);
  assert.equal(openLocalCash(`unit-a-${suffix}`, `operator-a-${suffix}`, 50), null);
  assert.ok(openLocalCash(`unit-b-${suffix}`, `operator-a-${suffix}`, 50));
  assert.ok(openLocalCash(`unit-a-${suffix}`, `operator-b-${suffix}`, 50));
  assert.equal(getLocalOpenCashSession(`unit-a-${suffix}`, `operator-a-${suffix}`)?.id, first.id);
});

test("suprimento e sangria alteram apenas o dinheiro esperado", () => {
  const suffix = Date.now().toString();
  const establishmentId = `movement-${suffix}`;
  const operatorId = `operator-${suffix}`;
  const cash = openLocalCash(establishmentId, operatorId, 100);
  assert.ok(cash);

  assert.notEqual(moveLocalCash(establishmentId, operatorId, { type: "SUPPLY", amount: 40, reason: "Troco adicional", idempotencyKey: `supply-${suffix}` }), "NO_OPEN_CASH");
  assert.notEqual(moveLocalCash(establishmentId, operatorId, { type: "WITHDRAWAL", amount: 30, reason: "Pagamento fornecedor", idempotencyKey: `withdrawal-${suffix}` }), "NO_OPEN_CASH");
  assert.equal(moveLocalCash(establishmentId, operatorId, { type: "WITHDRAWAL", amount: 1000, reason: "Valor excessivo", idempotencyKey: `excess-${suffix}` }), "INSUFFICIENT_CASH");

  const summary = summarizeLocalCash(cash);
  assert.equal(summary.expected.CASH, 110);
  assert.equal(summary.supplies, 40);
  assert.equal(summary.withdrawals, 30);
});

test("vendas alimentam a conferência e fechamento registra diferença", () => {
  const suffix = Date.now().toString();
  const establishmentId = `close-${suffix}`;
  const operatorId = `operator-${suffix}`;
  const cash = openLocalCash(establishmentId, operatorId, 50);
  assert.ok(cash);

  registerLocalCashSale(cash.id, "CASH", 25);
  registerLocalCashSale(cash.id, "PIX", 40);
  const beforeClose = summarizeLocalCash(cash);
  assert.deepEqual(beforeClose.expected, { PIX: 40, CREDIT_CARD: 0, DEBIT_CARD: 0, CASH: 75, OTHER: 0 });
  assert.equal(beforeClose.expectedTotal, 115);

  const closed = closeLocalCash(establishmentId, operatorId, { PIX: 40, CREDIT_CARD: 0, DEBIT_CARD: 0, CASH: 70, OTHER: 0 });
  assert.ok(closed);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.differenceAmount, -5);
  assert.equal(getLocalOpenCashSession(establishmentId, operatorId), null);
  assert.equal(listLocalCashHistory(establishmentId)[0]?.id, cash.id);
});

test("movimentação é idempotente", () => {
  const suffix = Date.now().toString();
  const establishmentId = `idempotency-${suffix}`;
  const operatorId = `operator-${suffix}`;
  const key = `movement-${suffix}`;
  assert.ok(openLocalCash(establishmentId, operatorId, 10));

  const first = moveLocalCash(establishmentId, operatorId, { type: "SUPPLY", amount: 5, reason: "Troco adicional", idempotencyKey: key });
  const duplicate = moveLocalCash(establishmentId, operatorId, { type: "SUPPLY", amount: 5, reason: "Troco adicional", idempotencyKey: key });
  assert.notEqual(first, "DUPLICATE");
  assert.equal(duplicate, "DUPLICATE");
});
