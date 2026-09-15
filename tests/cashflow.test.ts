import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCashFlow } from "../lib/cashflow.ts";
import { computeLocalCashFlow, createLocalFinancialCategory, createLocalFinancialEntry, createLocalBankAccount, updateLocalFinancialEntry } from "../lib/local-finance.ts";
import { recordLocalAudit } from "../lib/local-audit.ts";
import { openLocalCash, moveLocalCash } from "../lib/local-cash.ts";

test("summarizeCashFlow soma entradas e saidas e calcula saldo", () => {
  const result = summarizeCashFlow([
    { id: "1", date: "2026-09-01T10:00:00.000Z", description: "Venda", type: "IN", amount: 100, source: "SALE" },
    { id: "2", date: "2026-09-02T10:00:00.000Z", description: "Aluguel", type: "OUT", amount: 40, source: "ENTRY" },
  ]);
  assert.equal(result.income, 100);
  assert.equal(result.expense, 40);
  assert.equal(result.balance, 60);
  assert.equal(result.items[0]?.id, "1");
});

test("fluxo de caixa local soma lancamentos pagos + vendas + movimentacoes de caixa no periodo", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;

  const incomeCategory = createLocalFinancialCategory(orgId, "Vendas avulsas", "INCOME");
  const expenseCategory = createLocalFinancialCategory(orgId, "Fornecedores", "EXPENSE");
  if (incomeCategory === "DUPLICATE" || expenseCategory === "DUPLICATE") throw new Error("unexpected duplicate");

  createLocalBankAccount(storeId, { name: "Conta principal", bank: "Banco X", initialBalance: 500 });

  // Lançamento pago dentro do período (deve entrar)
  const paidEntry = createLocalFinancialEntry(orgId, storeId, userId, { categoryId: expenseCategory.id, description: "Compra de insumos", amount: 150, dueDate: "2026-09-10" });
  updateLocalFinancialEntry(storeId, paidEntry.id, { status: "PAID" });

  // Lançamento pendente (não deve entrar)
  createLocalFinancialEntry(orgId, storeId, userId, { categoryId: expenseCategory.id, description: "Conta a vencer", amount: 999, dueDate: "2026-09-15" });

  // Venda concluída (deve entrar como entrada)
  recordLocalAudit({ organizationId: orgId, establishmentId: storeId, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-1", after: { total: 80, channel: "POS" } });

  // Movimentação de caixa: suprimento (entrada) e retirada (saída)
  const cash = openLocalCash(storeId, userId, 0);
  if (!cash) throw new Error("cash session not opened");
  moveLocalCash(storeId, userId, { type: "SUPPLY", amount: 30, reason: "Reforço de caixa", idempotencyKey: crypto.randomUUID() });
  moveLocalCash(storeId, userId, { type: "WITHDRAWAL", amount: 20, reason: "Sangria", idempotencyKey: crypto.randomUUID() });

  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";
  const result = computeLocalCashFlow(orgId, storeId, from, to);

  // income = venda (80) + suprimento (30) = 110
  assert.equal(result.income, 110);
  // expense = lançamento pago (150) + retirada (20) = 170
  assert.equal(result.expense, 170);
  assert.equal(result.balance, 110 - 170);
  assert.equal(result.openingBalance, 500);
  assert.equal(result.accumulatedBalance, 500 + (110 - 170));
  assert.equal(result.items.length, 4);
});

test("fluxo de caixa exclui lancamentos fora do periodo e nao pagos", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const category = createLocalFinancialCategory(orgId, "Diversos", "EXPENSE");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");

  const outsideEntry = createLocalFinancialEntry(orgId, storeId, userId, { categoryId: category.id, description: "Fora do período", amount: 50, dueDate: "2026-08-01" });
  updateLocalFinancialEntry(storeId, outsideEntry.id, { status: "PAID" });
  // força paidAt para fora do período de teste
  updateLocalFinancialEntry(storeId, outsideEntry.id, { status: "PENDING" });
  updateLocalFinancialEntry(storeId, outsideEntry.id, { status: "PAID" });

  const result = computeLocalCashFlow(orgId, storeId, "2099-01-01T00:00:00.000Z", "2099-01-31T23:59:59.999Z");
  assert.equal(result.items.length, 0);
  assert.equal(result.income, 0);
  assert.equal(result.expense, 0);
});

test("fluxo de caixa desconta reembolso do valor liquido da venda", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";

  // Venda parcialmente reembolsada: 100 - 30 = 70 líquido
  recordLocalAudit({ organizationId: orgId, establishmentId: storeId, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-partial", after: { total: 100, channel: "POS" } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeId, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_REFUND", entityType: "Sale", entityId: "sale-partial", after: { amount: 30 } });

  // Venda totalmente reembolsada: não deve gerar entrada nenhuma
  recordLocalAudit({ organizationId: orgId, establishmentId: storeId, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-total", after: { total: 50, channel: "POS" } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeId, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_REFUND", entityType: "Sale", entityId: "sale-total", after: { amount: 50 } });

  const result = computeLocalCashFlow(orgId, storeId, from, to);
  assert.equal(result.income, 70);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, "sale-partial");
});

test("fluxo de caixa nao vaza entre estabelecimentos", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeA = `store-a-${crypto.randomUUID()}`;
  const storeB = `store-b-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const category = createLocalFinancialCategory(orgId, "Categoria isolamento", "INCOME");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");

  const entryA = createLocalFinancialEntry(orgId, storeA, userId, { categoryId: category.id, description: "Receita loja A", amount: 300, dueDate: "2026-09-05" });
  updateLocalFinancialEntry(storeA, entryA.id, { status: "PAID" });

  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";
  const resultA = computeLocalCashFlow(orgId, storeA, from, to);
  const resultB = computeLocalCashFlow(orgId, storeB, from, to);

  assert.equal(resultA.income, 300);
  assert.equal(resultB.income, 0);
});
