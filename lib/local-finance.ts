import { randomUUID } from "node:crypto";
import { listLocalAudit } from "./local-audit.ts";
import { listLocalCashMovementsForEstablishment } from "./local-cash.ts";
import { summarizeCashFlow, type CashFlowItem } from "./cashflow.ts";

type FinancialCategoryKind = "INCOME" | "EXPENSE";
type FinancialEntryStatus = "PENDING" | "PAID";

type LocalFinancialCategory = { id: string; organizationId: string; name: string; kind: FinancialCategoryKind; active: boolean; createdAt: string };
type LocalBankAccount = { id: string; establishmentId: string; name: string; bank: string; agency: string | null; accountNumber: string | null; initialBalance: number; active: boolean; createdAt: string };
type LocalPaymentMethodConfig = { id: string; establishmentId: string; name: string; kind: string; feeRate: number | null; settlementDays: number | null; active: boolean; createdAt: string };
type LocalSupplier = { id: string; organizationId: string; name: string; tradeName: string | null; document: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean; createdAt: string };
type LocalFinancialEntry = {
  id: string; organizationId: string; establishmentId: string; categoryId: string; bankAccountId: string | null; paymentMethodId: string | null; supplierId: string | null;
  description: string; amount: number; dueDate: string; paidAt: string | null; status: FinancialEntryStatus; notes: string | null; createdById: string; createdAt: string;
};

const categoriesByOrg = new Map<string, LocalFinancialCategory[]>();
const bankAccountsByEstablishment = new Map<string, LocalBankAccount[]>();
const paymentMethodsByEstablishment = new Map<string, LocalPaymentMethodConfig[]>();
const suppliersByOrg = new Map<string, LocalSupplier[]>();
const entriesByEstablishment = new Map<string, LocalFinancialEntry[]>();

function bucket<T>(map: Map<string, T[]>, key: string) {
  if (!map.has(key)) map.set(key, []);
  return map.get(key)!;
}
const sameName = (a: string, b: string) => a.toLocaleLowerCase("pt-BR") === b.toLocaleLowerCase("pt-BR");

// Categorias financeiras (escopo organização)
export function listLocalFinancialCategories(organizationId: string) {
  return bucket(categoriesByOrg, organizationId).map(item => ({ ...item }));
}
export function createLocalFinancialCategory(organizationId: string, name: string, kind: FinancialCategoryKind) {
  const list = bucket(categoriesByOrg, organizationId);
  if (list.some(item => sameName(item.name, name) && item.kind === kind)) return "DUPLICATE" as const;
  const category: LocalFinancialCategory = { id: `local-fin-cat-${randomUUID()}`, organizationId, name, kind, active: true, createdAt: new Date().toISOString() };
  list.push(category);
  return { ...category };
}
export function updateLocalFinancialCategory(organizationId: string, categoryId: string, data: { name?: string; kind?: FinancialCategoryKind; active?: boolean }) {
  const list = bucket(categoriesByOrg, organizationId);
  const category = list.find(item => item.id === categoryId);
  if (!category) return "NOT_FOUND" as const;
  const nextName = data.name ?? category.name;
  const nextKind = data.kind ?? category.kind;
  if (list.some(item => item.id !== categoryId && sameName(item.name, nextName) && item.kind === nextKind)) return "DUPLICATE" as const;
  Object.assign(category, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
  return { ...category };
}

// Contas bancárias (escopo estabelecimento)
export function listLocalBankAccounts(establishmentId: string) {
  return bucket(bankAccountsByEstablishment, establishmentId).map(item => ({ ...item }));
}
export function createLocalBankAccount(establishmentId: string, data: { name: string; bank: string; agency?: string | null; accountNumber?: string | null; initialBalance?: number }) {
  const list = bucket(bankAccountsByEstablishment, establishmentId);
  if (list.some(item => sameName(item.name, data.name))) return "DUPLICATE" as const;
  const account: LocalBankAccount = { id: `local-bank-${randomUUID()}`, establishmentId, name: data.name, bank: data.bank, agency: data.agency ?? null, accountNumber: data.accountNumber ?? null, initialBalance: data.initialBalance ?? 0, active: true, createdAt: new Date().toISOString() };
  list.push(account);
  return { ...account };
}
export function updateLocalBankAccount(establishmentId: string, accountId: string, data: { name?: string; bank?: string; agency?: string | null; accountNumber?: string | null; initialBalance?: number; active?: boolean }) {
  const list = bucket(bankAccountsByEstablishment, establishmentId);
  const account = list.find(item => item.id === accountId);
  if (!account) return "NOT_FOUND" as const;
  if (data.name && list.some(item => item.id !== accountId && sameName(item.name, data.name!))) return "DUPLICATE" as const;
  Object.assign(account, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
  return { ...account };
}

// Formas/métodos de pagamento configuráveis (escopo estabelecimento)
export function listLocalPaymentMethods(establishmentId: string) {
  return bucket(paymentMethodsByEstablishment, establishmentId).map(item => ({ ...item }));
}
export function createLocalPaymentMethod(establishmentId: string, data: { name: string; kind: string; feeRate?: number | null; settlementDays?: number | null }) {
  const list = bucket(paymentMethodsByEstablishment, establishmentId);
  if (list.some(item => sameName(item.name, data.name))) return "DUPLICATE" as const;
  const method: LocalPaymentMethodConfig = { id: `local-pm-${randomUUID()}`, establishmentId, name: data.name, kind: data.kind, feeRate: data.feeRate ?? null, settlementDays: data.settlementDays ?? null, active: true, createdAt: new Date().toISOString() };
  list.push(method);
  return { ...method };
}
export function updateLocalPaymentMethod(establishmentId: string, methodId: string, data: { name?: string; kind?: string; feeRate?: number | null; settlementDays?: number | null; active?: boolean }) {
  const list = bucket(paymentMethodsByEstablishment, establishmentId);
  const method = list.find(item => item.id === methodId);
  if (!method) return "NOT_FOUND" as const;
  if (data.name && list.some(item => item.id !== methodId && sameName(item.name, data.name!))) return "DUPLICATE" as const;
  Object.assign(method, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
  return { ...method };
}

// Fornecedores (escopo organização — uma rede compra do mesmo fornecedor em várias lojas)
export function listLocalSuppliers(organizationId: string) {
  return bucket(suppliersByOrg, organizationId).map(item => ({ ...item }));
}
export function createLocalSupplier(organizationId: string, data: { name: string; tradeName?: string | null; document?: string | null; phone?: string | null; email?: string | null; notes?: string | null }) {
  const list = bucket(suppliersByOrg, organizationId);
  if (list.some(item => sameName(item.name, data.name))) return "DUPLICATE" as const;
  const supplier: LocalSupplier = { id: `local-supplier-${randomUUID()}`, organizationId, name: data.name, tradeName: data.tradeName ?? null, document: data.document ?? null, phone: data.phone ?? null, email: data.email ?? null, notes: data.notes ?? null, active: true, createdAt: new Date().toISOString() };
  list.push(supplier);
  return { ...supplier };
}
export function updateLocalSupplier(organizationId: string, supplierId: string, data: { name?: string; tradeName?: string | null; document?: string | null; phone?: string | null; email?: string | null; notes?: string | null; active?: boolean }) {
  const list = bucket(suppliersByOrg, organizationId);
  const supplier = list.find(item => item.id === supplierId);
  if (!supplier) return "NOT_FOUND" as const;
  if (data.name && list.some(item => item.id !== supplierId && sameName(item.name, data.name!))) return "DUPLICATE" as const;
  Object.assign(supplier, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
  return { ...supplier };
}

// Lançamentos financeiros (escopo estabelecimento)
export function listLocalFinancialEntries(establishmentId: string, filter?: { status?: FinancialEntryStatus; from?: string; to?: string }) {
  return bucket(entriesByEstablishment, establishmentId)
    .filter(entry => !filter?.status || entry.status === filter.status)
    .filter(entry => !filter?.from || entry.dueDate >= filter.from)
    .filter(entry => !filter?.to || entry.dueDate <= filter.to)
    .map(item => ({ ...item }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
export function createLocalFinancialEntry(organizationId: string, establishmentId: string, createdById: string, data: { categoryId: string; bankAccountId?: string | null; paymentMethodId?: string | null; supplierId?: string | null; description: string; amount: number; dueDate: string; notes?: string | null }) {
  const entry: LocalFinancialEntry = {
    id: `local-fin-entry-${randomUUID()}`, organizationId, establishmentId, categoryId: data.categoryId, bankAccountId: data.bankAccountId ?? null, paymentMethodId: data.paymentMethodId ?? null, supplierId: data.supplierId ?? null,
    description: data.description, amount: data.amount, dueDate: data.dueDate, paidAt: null, status: "PENDING", notes: data.notes ?? null, createdById, createdAt: new Date().toISOString(),
  };
  bucket(entriesByEstablishment, establishmentId).push(entry);
  return { ...entry };
}
export function updateLocalFinancialEntry(establishmentId: string, entryId: string, data: { description?: string; amount?: number; dueDate?: string; categoryId?: string; bankAccountId?: string | null; paymentMethodId?: string | null; supplierId?: string | null; notes?: string | null; status?: FinancialEntryStatus }) {
  const list = bucket(entriesByEstablishment, establishmentId);
  const entry = list.find(item => item.id === entryId);
  if (!entry) return "NOT_FOUND" as const;
  Object.assign(entry, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
  if (data.status === "PAID" && !entry.paidAt) entry.paidAt = new Date().toISOString();
  if (data.status === "PENDING") entry.paidAt = null;
  return { ...entry };
}

// Fluxo de caixa (regime de caixa): combina lançamentos financeiros pagos (paidAt no período),
// vendas do PDV/salão/delivery concluídas no período (via eventos de auditoria, único rastro de
// vendas disponível em modo local — não existe um "banco" de vendas locais separado) e
// suprimentos/retiradas de caixa (CashMovement) no período. Nao reconcilia por conta bancária.
export function computeLocalCashFlow(organizationId: string, establishmentId: string, from: string, to: string) {
  const items: CashFlowItem[] = [];

  const categories = new Map(listLocalFinancialCategories(organizationId).map(category => [category.id, category]));
  for (const entry of listLocalFinancialEntries(establishmentId, { status: "PAID" })) {
    if (!entry.paidAt || entry.paidAt < from || entry.paidAt > to) continue;
    const category = categories.get(entry.categoryId);
    items.push({ id: entry.id, date: entry.paidAt, description: entry.description, type: category?.kind === "INCOME" ? "IN" : "OUT", amount: entry.amount, source: "ENTRY" });
  }

  const completedEvents = listLocalAudit({ organizationId, establishmentId, action: "SALE_COMPLETE", limit: 2000 })
    .filter(event => event.createdAt >= from && event.createdAt <= to);
  const cancelledIds = new Set(listLocalAudit({ organizationId, establishmentId, action: "SALE_CANCEL", limit: 2000 }).map(event => event.entityId));
  const refundedBySale = new Map<string, number>();
  for (const event of listLocalAudit({ organizationId, establishmentId, action: "SALE_REFUND", limit: 2000 })) {
    const after = event.after as { amount?: number } | undefined;
    refundedBySale.set(event.entityId, (refundedBySale.get(event.entityId) ?? 0) + (after?.amount ?? 0));
  }
  for (const event of completedEvents) {
    if (cancelledIds.has(event.entityId)) continue;
    const after = event.after as { total?: number; channel?: string } | undefined;
    const total = after?.total ?? 0;
    const netAmount = total - (refundedBySale.get(event.entityId) ?? 0);
    if (netAmount <= 0) continue;
    items.push({ id: event.entityId, date: event.createdAt, description: `Venda ${after?.channel ?? "PDV"}`, type: "IN", amount: netAmount, source: "SALE" });
  }

  for (const movement of listLocalCashMovementsForEstablishment(establishmentId, from, to)) {
    items.push({ id: movement.id, date: movement.createdAt, description: movement.reason, type: movement.type === "SUPPLY" ? "IN" : "OUT", amount: movement.amount, source: "CASH_MOVEMENT" });
  }

  const openingBalance = listLocalBankAccounts(establishmentId).reduce((sum, account) => sum + account.initialBalance, 0);
  const summary = summarizeCashFlow(items);
  return { ...summary, openingBalance, accumulatedBalance: openingBalance + summary.balance };
}
