import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalFinancialCategory,
  createLocalBankAccount,
  createLocalFinancialEntry,
  updateLocalFinancialEntry,
  listLocalFinancialEntriesForReconciliation,
  reconcileLocalFinancialEntry,
} from "../lib/local-finance.ts";

const period = () => {
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";
  return { from, to };
};

test("marcar e desmarcar lançamento como conciliado", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const account = createLocalBankAccount(storeId, { name: "Conta principal", bank: "Banco X" });
  if (account === "DUPLICATE") throw new Error("unexpected duplicate");
  const category = createLocalFinancialCategory(orgId, "Insumos", "EXPENSE");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");
  const entry = createLocalFinancialEntry(orgId, storeId, userId, { categoryId: category.id, bankAccountId: account.id, description: "Compra de carnes", amount: 500, dueDate: "2026-09-10" });
  updateLocalFinancialEntry(storeId, entry.id, { status: "PAID" });

  assert.equal(entry.reconciled, false);
  const reconciled = reconcileLocalFinancialEntry(storeId, entry.id, true, userId);
  if (reconciled === "NOT_FOUND") throw new Error("entry not found");
  assert.equal(reconciled.reconciled, true);
  assert.notEqual(reconciled.reconciledAt, null);
  assert.equal(reconciled.reconciledById, userId);

  const unreconciled = reconcileLocalFinancialEntry(storeId, entry.id, false, userId);
  if (unreconciled === "NOT_FOUND") throw new Error("entry not found");
  assert.equal(unreconciled.reconciled, false);
  assert.equal(unreconciled.reconciledAt, null);
  assert.equal(unreconciled.reconciledById, null);
});

test("reconciliar lançamento inexistente retorna NOT_FOUND", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const result = reconcileLocalFinancialEntry(storeId, "nao-existe", true, "user-1");
  assert.equal(result, "NOT_FOUND");
});

test("totais de lançado/conciliado/pendente por conta e período", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const account = createLocalBankAccount(storeId, { name: "Conta principal", bank: "Banco X" });
  if (account === "DUPLICATE") throw new Error("unexpected duplicate");
  const category = createLocalFinancialCategory(orgId, "Diversos", "EXPENSE");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");

  const entryA = createLocalFinancialEntry(orgId, storeId, userId, { categoryId: category.id, bankAccountId: account.id, description: "Conta 1", amount: 100, dueDate: "2026-09-05" });
  updateLocalFinancialEntry(storeId, entryA.id, { status: "PAID" });
  reconcileLocalFinancialEntry(storeId, entryA.id, true, userId);

  const entryB = createLocalFinancialEntry(orgId, storeId, userId, { categoryId: category.id, bankAccountId: account.id, description: "Conta 2", amount: 250, dueDate: "2026-09-08" });
  updateLocalFinancialEntry(storeId, entryB.id, { status: "PAID" });
  // entryB permanece não conciliada

  const { from, to } = period();
  const items = listLocalFinancialEntriesForReconciliation(storeId, account.id, from, to);
  assert.equal(items.length, 2);
  const launched = items.reduce((sum, item) => sum + item.amount, 0);
  const reconciledTotal = items.filter(item => item.reconciled).reduce((sum, item) => sum + item.amount, 0);
  assert.equal(launched, 350);
  assert.equal(reconciledTotal, 100);
  assert.equal(launched - reconciledTotal, 250);
});

test("lançamentos sem bankAccountId não aparecem na conciliação de nenhuma conta", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const account = createLocalBankAccount(storeId, { name: "Conta principal", bank: "Banco X" });
  if (account === "DUPLICATE") throw new Error("unexpected duplicate");
  const category = createLocalFinancialCategory(orgId, "Diversos", "EXPENSE");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");

  // Sem bankAccountId — não deve entrar na conciliação
  const entryNoAccount = createLocalFinancialEntry(orgId, storeId, userId, { categoryId: category.id, description: "Sem conta vinculada", amount: 90, dueDate: "2026-09-06" });
  updateLocalFinancialEntry(storeId, entryNoAccount.id, { status: "PAID" });

  const { from, to } = period();
  const items = listLocalFinancialEntriesForReconciliation(storeId, account.id, from, to);
  assert.equal(items.length, 0);
});

test("conciliação não vaza entre contas bancárias nem entre estabelecimentos", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const otherStoreId = `store-other-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const accountA = createLocalBankAccount(storeId, { name: "Conta A", bank: "Banco X" });
  const accountB = createLocalBankAccount(storeId, { name: "Conta B", bank: "Banco Y" });
  if (accountA === "DUPLICATE" || accountB === "DUPLICATE") throw new Error("unexpected duplicate");
  const category = createLocalFinancialCategory(orgId, "Diversos", "EXPENSE");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");

  const entryA = createLocalFinancialEntry(orgId, storeId, userId, { categoryId: category.id, bankAccountId: accountA.id, description: "Conta A", amount: 100, dueDate: "2026-09-05" });
  updateLocalFinancialEntry(storeId, entryA.id, { status: "PAID" });
  const entryOther = createLocalFinancialEntry(orgId, otherStoreId, userId, { categoryId: category.id, bankAccountId: accountA.id, description: "Outro estabelecimento", amount: 500, dueDate: "2026-09-05" });
  updateLocalFinancialEntry(otherStoreId, entryOther.id, { status: "PAID" });

  const { from, to } = period();
  const itemsAccountA = listLocalFinancialEntriesForReconciliation(storeId, accountA.id, from, to);
  const itemsAccountB = listLocalFinancialEntriesForReconciliation(storeId, accountB.id, from, to);
  const itemsOtherStore = listLocalFinancialEntriesForReconciliation(otherStoreId, accountA.id, from, to);

  assert.equal(itemsAccountA.length, 1);
  assert.equal(itemsAccountA[0]?.id, entryA.id);
  assert.equal(itemsAccountB.length, 0);
  assert.equal(itemsOtherStore.length, 1);
  assert.equal(itemsOtherStore[0]?.id, entryOther.id);
});
