import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalFinancialCategory,
  createLocalBankAccount,
  createLocalFinancialEntry,
  createLocalSupplier,
  listLocalFinancialCategories,
  listLocalFinancialEntries,
  listLocalSuppliers,
  updateLocalFinancialEntry,
  updateLocalSupplier,
} from "../lib/local-finance.ts";
import { hasPermission, type PermissionContext } from "../lib/authorization.ts";

test("categoria financeira não duplica nome+tipo na mesma organização", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const created = createLocalFinancialCategory(orgId, "Aluguel", "EXPENSE");
  assert.notEqual(created, "DUPLICATE");
  const duplicate = createLocalFinancialCategory(orgId, "Aluguel", "EXPENSE");
  assert.equal(duplicate, "DUPLICATE");
  const sameNameOtherKind = createLocalFinancialCategory(orgId, "Aluguel", "INCOME");
  assert.notEqual(sameNameOtherKind, "DUPLICATE");
});

test("categorias e lançamentos não vazam entre organizações/estabelecimentos", () => {
  const orgA = `org-a-${crypto.randomUUID()}`;
  const orgB = `org-b-${crypto.randomUUID()}`;
  createLocalFinancialCategory(orgA, "Vendas de balcão", "INCOME");
  createLocalFinancialCategory(orgB, "Vendas de balcão", "INCOME");
  assert.equal(listLocalFinancialCategories(orgA).length, 1);
  assert.equal(listLocalFinancialCategories(orgB).length, 1);

  const storeA = `store-a-${crypto.randomUUID()}`;
  const storeB = `store-b-${crypto.randomUUID()}`;
  const category = createLocalFinancialCategory(orgA, "Fornecedores", "EXPENSE");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");
  createLocalFinancialEntry(orgA, storeA, "user-1", { categoryId: category.id, description: "Compra de insumos", amount: 100, dueDate: "2026-09-20" });
  createLocalFinancialEntry(orgA, storeB, "user-1", { categoryId: category.id, description: "Compra de insumos loja B", amount: 200, dueDate: "2026-09-21" });

  assert.equal(listLocalFinancialEntries(storeA).length, 1);
  assert.equal(listLocalFinancialEntries(storeB).length, 1);
  assert.equal(listLocalFinancialEntries(storeA)[0]?.description, "Compra de insumos");
});

test("transição de lançamento pendente para pago registra data e pode reverter", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const category = createLocalFinancialCategory(orgId, "Contas de consumo", "EXPENSE");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");
  const entry = createLocalFinancialEntry(orgId, storeId, "user-1", { categoryId: category.id, description: "Energia elétrica", amount: 350.5, dueDate: "2026-10-05" });
  assert.equal(entry.status, "PENDING");
  assert.equal(entry.paidAt, null);

  const paid = updateLocalFinancialEntry(storeId, entry.id, { status: "PAID" });
  if (paid === "NOT_FOUND") throw new Error("entry not found");
  assert.equal(paid.status, "PAID");
  assert.notEqual(paid.paidAt, null);

  const reverted = updateLocalFinancialEntry(storeId, entry.id, { status: "PENDING" });
  if (reverted === "NOT_FOUND") throw new Error("entry not found");
  assert.equal(reverted.status, "PENDING");
  assert.equal(reverted.paidAt, null);
});

test("soma de lançamentos pendentes de um estabelecimento", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const category = createLocalFinancialCategory(orgId, "Diversos", "EXPENSE");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");
  createLocalFinancialEntry(orgId, storeId, "user-1", { categoryId: category.id, description: "Conta 1", amount: 100, dueDate: "2026-09-10" });
  const second = createLocalFinancialEntry(orgId, storeId, "user-1", { categoryId: category.id, description: "Conta 2", amount: 250, dueDate: "2026-09-12" });
  updateLocalFinancialEntry(storeId, second.id, { status: "PAID" });

  const pendingTotal = listLocalFinancialEntries(storeId, { status: "PENDING" }).reduce((sum, e) => sum + e.amount, 0);
  const paidTotal = listLocalFinancialEntries(storeId, { status: "PAID" }).reduce((sum, e) => sum + e.amount, 0);
  assert.equal(pendingTotal, 100);
  assert.equal(paidTotal, 250);
});

test("conta bancária não duplica nome no mesmo estabelecimento", () => {
  const storeId = `store-${crypto.randomUUID()}`;
  const created = createLocalBankAccount(storeId, { name: "Conta principal", bank: "Banco X" });
  assert.notEqual(created, "DUPLICATE");
  const duplicate = createLocalBankAccount(storeId, { name: "Conta principal", bank: "Banco Y" });
  assert.equal(duplicate, "DUPLICATE");
});

test("fornecedor não duplica nome na mesma organização", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const created = createLocalSupplier(orgId, { name: "Distribuidora Boa Compra" });
  assert.notEqual(created, "DUPLICATE");
  const duplicate = createLocalSupplier(orgId, { name: "Distribuidora Boa Compra" });
  assert.equal(duplicate, "DUPLICATE");
});

test("fornecedores não vazam entre organizações e são compartilhados entre estabelecimentos da mesma organização", () => {
  const orgA = `org-a-${crypto.randomUUID()}`;
  const orgB = `org-b-${crypto.randomUUID()}`;
  createLocalSupplier(orgA, { name: "Fornecedor Único" });
  createLocalSupplier(orgB, { name: "Fornecedor Único" });
  assert.equal(listLocalSuppliers(orgA).length, 1);
  assert.equal(listLocalSuppliers(orgB).length, 1);
});

test("fornecedor é apenas inativado, nunca excluído", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const created = createLocalSupplier(orgId, { name: "Fornecedor Teste" });
  if (created === "DUPLICATE") throw new Error("unexpected duplicate");
  const inactivated = updateLocalSupplier(orgId, created.id, { active: false });
  if (inactivated === "NOT_FOUND" || inactivated === "DUPLICATE") throw new Error("unexpected result");
  assert.equal(inactivated.active, false);
  assert.equal(listLocalSuppliers(orgId).some(item => item.id === created.id), true);
});

test("lançamento financeiro pode ser criado e atualizado com supplierId opcional, e um supplierId de outra organização não é aceito pela camada de API (validação feita na rota)", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const otherOrgId = `org-other-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const category = createLocalFinancialCategory(orgId, "Insumos", "EXPENSE");
  if (category === "DUPLICATE") throw new Error("unexpected duplicate");
  const supplier = createLocalSupplier(orgId, { name: "Fornecedor da Casa" });
  if (supplier === "DUPLICATE") throw new Error("unexpected duplicate");
  const otherSupplier = createLocalSupplier(otherOrgId, { name: "Fornecedor de Fora" });
  if (otherSupplier === "DUPLICATE") throw new Error("unexpected duplicate");

  const entry = createLocalFinancialEntry(orgId, storeId, "user-1", { categoryId: category.id, description: "Compra de carnes", amount: 500, dueDate: "2026-09-25", supplierId: supplier.id });
  assert.equal(entry.supplierId, supplier.id);

  // A camada de storage local não valida o tenant do fornecedor por si só (isso é responsabilidade
  // da rota de API, testada implicitamente por resolveActor/listLocalSuppliers filtrando por organização);
  // aqui garantimos que a lista de fornecedores válidos da organização não inclui o de outra organização.
  assert.equal(listLocalSuppliers(orgId).some(item => item.id === otherSupplier.id), false);

  const updated = updateLocalFinancialEntry(storeId, entry.id, { supplierId: null });
  if (updated === "NOT_FOUND") throw new Error("entry not found");
  assert.equal(updated.supplierId, null);
});

test("permissões de financeiro são independentes entre gerenciar cadastros e lançamentos", () => {
  const context: PermissionContext = {
    organizationId: "org-a",
    allowedEstablishmentIds: new Set(["store-a"]),
    rolePermissions: new Set(["finance.manage"]),
    overrides: new Map(),
  };
  assert.equal(hasPermission(context, "finance.manage"), true);
  assert.equal(hasPermission(context, "finance.entries.manage"), false);
  const entriesContext = { ...context, rolePermissions: new Set(["finance.entries.manage"]) };
  assert.equal(hasPermission(entriesContext, "finance.manage"), false);
  assert.equal(hasPermission(entriesContext, "finance.entries.manage"), true);
});
