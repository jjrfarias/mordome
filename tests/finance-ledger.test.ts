import test from "node:test";
import assert from "node:assert/strict";
import { addDays, buildFinanceOverview, businessDay, cents, decimal, ledgerBalanceAt, validDay, type LedgerAccount, type LedgerEntry } from "../lib/finance-ledger.ts";
import { createFinanceEntrySchema, updateFinanceEntrySchema } from "../lib/finance-validation.ts";

const accounts: LedgerAccount[] = [{ id: "bank", name: "Banco", active: true, initialBalance: "1000.10", balanceAsOf: "2026-10-01" }];
const entry = (id: string, options: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, description: id, kind: "EXPENSE", amount: "100.05", dueDate: "2026-11-08", paidAt: null, status: "PENDING", bankAccountId: "bank", ...options });

test("extrato histórico respeita abertura no próprio dia e ignora baixas posteriores", () => {
  const entries = [entry("same-day", { status: "PAID", paidAt: "2026-10-01T15:00:00Z" }), entry("later", { status: "PAID", paidAt: "2026-11-06T15:00:00Z" })];
  assert.equal(ledgerBalanceAt(accounts, entries, "2026-10-01", true), 100010);
  assert.equal(ledgerBalanceAt(accounts, entries, "2026-10-01"), 90005);
  assert.equal(ledgerBalanceAt(accounts, entries, "2026-09-30"), null);
});

test("centavos exatos e validação monetária: sem arredondamento oculto", () => {
  assert.equal(cents("0.10") + cents("0.20"), 30);
  assert.equal(decimal(-123), "-1.23");
  for (const invalid of ["1.001", "NaN", "1e3", "Infinity", "1,00", "10000000000.00"]) assert.throws(() => cents(invalid));
});
test("datas civis e data efetiva no fuso de São Paulo", () => {
  assert.equal(validDay("2026-02-30"), false);
  assert.equal(validDay("2028-02-29"), true);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(businessDay("2026-11-07T01:00:00Z"), "2026-11-06");
});
test("saldo carrega baixas anteriores ao mês e ignora movimentos incorporados no saldo inicial", () => {
  const report = buildFinanceOverview(accounts, [
    entry("before", { status: "PAID", paidAt: "2026-09-30T15:00:00Z", amount: "999.99" }),
    entry("previous-month", { status: "PAID", paidAt: "2026-10-15T15:00:00Z", amount: "200.10", kind: "INCOME" }),
    entry("month", { status: "PAID", paidAt: "2026-11-05T15:00:00Z" }),
  ], "2026-11-06", 7);
  assert.equal(report.balanceCents, 110015);
  assert.equal(report.paidMonthCents, 10005);
  assert.equal(report.receivedMonthCents, 0);
  assert.equal(report.projectedBalanceCents, 110015);
});
test("previsão separa vencidos, realizado e futuros, sem duplicar a baixa", () => {
  const data = [entry("overdue-out", { dueDate: "2026-11-01" }), entry("overdue-in", { kind: "INCOME", dueDate: "2026-11-01" }), entry("future-in", { kind: "INCOME" }), entry("after-window", { dueDate: "2026-12-01" })];
  const report = buildFinanceOverview(accounts, data, "2026-11-06", 7);
  assert.equal(report.daily[0].expenseCents, 10005);
  assert.equal(report.daily[0].incomeCents, 0);
  assert.equal(report.overdueIncomeCents, 10005);
  assert.equal(report.incomeCents, 10005);
  assert.equal(report.expenseCents, 10005);
  assert.equal(report.projectedBalanceCents, 100010);
  data[0] = { ...data[0], status: "PAID", paidAt: "2026-11-06T15:00:00Z" };
  const paid = buildFinanceOverview(accounts, data, "2026-11-06", 7);
  assert.equal(paid.balanceCents, 90005);
  assert.equal(paid.expenseCents, 0);
  assert.equal(paid.projectedBalanceCents, report.projectedBalanceCents);
});
test("saldo incompleto não vira zero e contas inativas preservam saldo", () => {
  assert.equal(buildFinanceOverview([], [], "2026-11-06", 7).balanceCents, null);
  assert.equal(buildFinanceOverview([{ ...accounts[0], balanceAsOf: null }], [], "2026-11-06", 7).projectedBalanceCents, null);
  assert.equal(buildFinanceOverview([{ ...accounts[0], active: false }], [], "2026-11-06", 7).balanceCents, 100010);
  assert.equal(buildFinanceOverview(accounts, [entry("legacy", { status: "PAID", bankAccountId: null, paidAt: "2026-11-01T15:00:00Z" })], "2026-11-06", 7).balanceCents, null);
  assert.equal(buildFinanceOverview(accounts, [entry("future", { status: "PAID", paidAt: "2027-11-01T15:00:00Z" })], "2026-11-06", 7).balanceCents, null);
});
test("filtro de conta não mistura dinheiro nem compromissos sem conta", () => {
  const report = buildFinanceOverview([...accounts, { ...accounts[0], id: "other", initialBalance: "500.00" }], [entry("other", { bankAccountId: "other" }), entry("unknown", { bankAccountId: null })], "2026-11-06", 7, "bank");
  assert.equal(report.balanceCents, 100010);
  assert.equal(report.expenseCents, 0);
});
test("validação de lançamentos recusa datas impossíveis, valores fracionados e baixa futura", () => {
  const data = { categoryId: "c", description: "Aluguel", amount: "100.10", dueDate: "2026-11-06" };
  assert.equal(createFinanceEntrySchema.parse(data).amount, "100.10");
  for (const change of [{ amount: "0" }, { amount: "1.001" }, { dueDate: "2026-02-30" }]) assert.equal(createFinanceEntrySchema.safeParse({ ...data, ...change }).success, false);
  assert.equal(updateFinanceEntrySchema.safeParse({ entryId: "e", status: "PAID", paidDate: addDays(businessDay(), 1) }).success, false);
});
