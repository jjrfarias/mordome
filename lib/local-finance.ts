import { randomUUID } from "node:crypto";
import { listLocalAudit } from "./local-audit.ts";
import { listLocalCashMovementsForEstablishment } from "./local-cash.ts";
import { summarizeCashFlow, type CashFlowItem } from "./cashflow.ts";
import type { SaleRecord } from "./reports/sales.ts";
import { buildCmvReport, type CmvSaleItemInput } from "./cmv.ts";
import { getLocalAverageCostByInventoryItemId } from "./local-inventory.ts";
import { listLocalRecipes } from "./local-recipes.ts";
import { calculateRecipeConsumption } from "./inventory-domain.ts";
import { buildDreReport, type DreReport } from "./reports/dre.ts";

type FinancialCategoryKind = "INCOME" | "EXPENSE";
type FinancialEntryStatus = "PENDING" | "PAID";

type LocalFinancialCategory = { id: string; organizationId: string; name: string; kind: FinancialCategoryKind; active: boolean; createdAt: string };
type LocalBankAccount = { id: string; establishmentId: string; name: string; bank: string; agency: string | null; accountNumber: string | null; initialBalance: number; active: boolean; createdAt: string };
type LocalPaymentMethodConfig = { id: string; establishmentId: string; name: string; kind: string; feeRate: number | null; settlementDays: number | null; active: boolean; createdAt: string };
type LocalSupplier = { id: string; organizationId: string; name: string; tradeName: string | null; document: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean; createdAt: string };
type LocalFinancialEntry = {
  id: string; organizationId: string; establishmentId: string; categoryId: string; bankAccountId: string | null; paymentMethodId: string | null; supplierId: string | null;
  description: string; amount: number; dueDate: string; paidAt: string | null; status: FinancialEntryStatus; notes: string | null; createdById: string; createdAt: string;
  reconciled: boolean; reconciledAt: string | null; reconciledById: string | null;
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
    reconciled: false, reconciledAt: null, reconciledById: null,
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

// Conciliação bancária: apenas lançamentos financeiros pagos com bankAccountId preenchido
// entram na conciliação de uma conta (vendas e movimentações de caixa não têm conta bancária
// específica associada e ficam fora deste escopo, ver ADR 0019).
export function listLocalFinancialEntriesForReconciliation(establishmentId: string, bankAccountId: string, from: string, to: string) {
  return bucket(entriesByEstablishment, establishmentId)
    .filter(entry => entry.status === "PAID" && entry.bankAccountId === bankAccountId && entry.paidAt && entry.paidAt >= from && entry.paidAt <= to)
    .map(item => ({ ...item }))
    .sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""));
}
export function reconcileLocalFinancialEntry(establishmentId: string, entryId: string, reconciled: boolean, actorId: string) {
  const list = bucket(entriesByEstablishment, establishmentId);
  const entry = list.find(item => item.id === entryId);
  if (!entry) return "NOT_FOUND" as const;
  entry.reconciled = reconciled;
  entry.reconciledAt = reconciled ? new Date().toISOString() : null;
  entry.reconciledById = reconciled ? actorId : null;
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

// Vendas concluídas no período, para os relatórios (ADR 0033). Mesmo rastro de eventos de
// auditoria usado por `computeLocalCashFlow` (não existe um "banco" de vendas locais separado),
// mas devolvendo o registro completo (bruto, desconto, mesa, forma de pagamento) em vez de já
// resumir em entradas de fluxo de caixa. Exclui vendas canceladas e totalmente reembolsadas.
export function listLocalSalesForReport(organizationId: string, establishmentId: string, from: string, to: string): SaleRecord[] {
  const completedEvents = listLocalAudit({ organizationId, establishmentId, action: "SALE_COMPLETE", limit: 5000 })
    .filter(event => event.createdAt >= from && event.createdAt <= to);
  const cancelledIds = new Set(listLocalAudit({ organizationId, establishmentId, action: "SALE_CANCEL", limit: 5000 }).map(event => event.entityId));
  const refundedBySale = new Map<string, number>();
  for (const event of listLocalAudit({ organizationId, establishmentId, action: "SALE_REFUND", limit: 5000 })) {
    const after = event.after as { amount?: number } | undefined;
    refundedBySale.set(event.entityId, (refundedBySale.get(event.entityId) ?? 0) + (after?.amount ?? 0));
  }

  const records: SaleRecord[] = [];
  for (const event of completedEvents) {
    if (cancelledIds.has(event.entityId)) continue;
    const after = event.after as { channel?: string; table?: number; payments?: { method: string; amount?: number }[]; discount?: number; subtotal?: number; total?: number; deliveryAreaId?: string | null; deliveryAreaName?: string | null; deliveryFee?: number; items?: { productName?: string; quantity?: number; unitPrice?: number }[] } | undefined;
    const total = after?.total ?? 0;
    const refunded = refundedBySale.get(event.entityId) ?? 0;
    if (total > 0 && refunded >= total) continue;
    records.push({
      id: event.entityId,
      completedAt: event.createdAt,
      channel: after?.channel ?? "POS",
      table: after?.table ?? null,
      payment: after?.payments?.map(payment => payment.method).join(" + ") ?? "",
      subtotal: after?.subtotal ?? 0,
      discount: after?.discount ?? 0,
      total,
      refunded,
      // O ator que registrou o evento SALE_COMPLETE é sempre quem processou o pagamento/fechamento
      // da venda (mesmo `operatorId` gravado em `Sale` no modo servidor, ver
      // `app/api/operations/sales/route.ts`) — não existe um "banco" de vendas locais separado do
      // log de auditoria (ADR 0033), então reaproveitamos actorId/actorName daqui (ADR 0034).
      operatorId: event.actorId,
      operatorName: event.actorName,
      // Pagamentos individuais (método + valor) já vêm prontos no próprio evento SALE_COMPLETE
      // (`payments` gravado por `app/api/operations/sales/route.ts` ao chamar `resolvePayments`),
      // reaproveitados sem nenhuma estrutura nova para o relatório de Vendas por forma de pagamento
      // (ADR 0035).
      payments: after?.payments?.map(payment => ({ method: payment.method, amount: payment.amount ?? 0 })) ?? [],
      // Área de entrega (ADR 0028) e taxa cobrada, gravadas no evento SALE_COMPLETE
      // (`app/api/operations/sales/route.ts`) apenas para vendas de delivery — reaproveitadas sem
      // nenhuma estrutura nova pelo relatório de Vendas por área de entrega (ADR 0036).
      deliveryAreaId: after?.deliveryAreaId ?? null,
      deliveryAreaName: after?.deliveryAreaName ?? null,
      deliveryFee: after?.deliveryFee ?? 0,
      // Itens da venda (nome/quantidade/preço), já gravados no evento SALE_COMPLETE por todo canal
      // (`app/api/operations/sales/route.ts`) — reaproveitados sem nenhuma estrutura nova pelo
      // relatório de Itens vendidos (ADR 0037).
      items: after?.items?.map(item => ({ productName: item.productName ?? "Produto", quantity: item.quantity ?? 0, unitPrice: item.unitPrice ?? 0 })) ?? [],
    });
  }
  return records;
}

export type SaleManagementRecord = { id: string; completedAt: string; channel: string; status: "COMPLETED" | "CANCELLED" | "PARTIALLY_REFUNDED" | "REFUNDED"; payment: string; total: number; refunded: number; itemsCount: number };

// Histórico de vendas para cancelamento/reembolso (ADR 0046): ao contrário de
// `listLocalSalesForReport` (que exclui canceladas/totalmente reembolsadas — é uma visão de BI),
// esta função devolve TODAS as vendas do período, com o status explícito, para o dono localizar
// qualquer venda e decidir a ação. Mesmo rastro de eventos de auditoria, sem "banco" de vendas
// locais separado.
export function listLocalSalesForManagement(organizationId: string, establishmentId: string, from: string, to: string): SaleManagementRecord[] {
  const completedEvents = listLocalAudit({ organizationId, establishmentId, action: "SALE_COMPLETE", limit: 5000 })
    .filter(event => event.createdAt >= from && event.createdAt <= to);
  const cancelledIds = new Set(listLocalAudit({ organizationId, establishmentId, action: "SALE_CANCEL", limit: 5000 }).map(event => event.entityId));
  const refundedBySale = new Map<string, number>();
  for (const event of listLocalAudit({ organizationId, establishmentId, action: "SALE_REFUND", limit: 5000 })) {
    const after = event.after as { amount?: number } | undefined;
    refundedBySale.set(event.entityId, (refundedBySale.get(event.entityId) ?? 0) + (after?.amount ?? 0));
  }

  const records: SaleManagementRecord[] = [];
  for (const event of completedEvents) {
    const after = event.after as { channel?: string; payments?: { method: string; amount?: number }[]; total?: number; items?: unknown[] } | undefined;
    const total = after?.total ?? 0;
    const refunded = refundedBySale.get(event.entityId) ?? 0;
    const status: SaleManagementRecord["status"] = cancelledIds.has(event.entityId) ? "CANCELLED" : total > 0 && refunded >= total ? "REFUNDED" : refunded > 0 ? "PARTIALLY_REFUNDED" : "COMPLETED";
    records.push({
      id: event.entityId,
      completedAt: event.createdAt,
      channel: after?.channel ?? "POS",
      status,
      payment: after?.payments?.map(payment => payment.method).join(" + ") ?? "",
      total,
      refunded,
      itemsCount: after?.items?.length ?? 0,
    });
  }
  return records.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

// DRE Gerencial/Financeira simplificada (ADR 0040), modo local. Reaproveita, sem recalcular:
// - `listLocalSalesForReport` para Receita bruta (soma de `total`), Descontos (soma de `discount`)
//   e Reembolsos (soma de `refunded`) — mesmos campos já usados por todos os outros relatórios de
//   vendas desta série, já isolados por estabelecimento e já excluindo canceladas/totalmente
//   reembolsadas.
// - A mesma reconstituição de consumo por ficha técnica ATUAL usada pela rota de CMV
//   (`app/api/admin/inventory/cmv-report/route.ts`, modo local) para chamar `buildCmvReport`
//   (`lib/cmv.ts`) — nenhuma lógica de CMV é reimplementada aqui.
// - `listLocalFinancialCategories`/`listLocalFinancialEntries` para separar lançamentos pagos por
//   categoria INCOME (Outras receitas) e EXPENSE (Despesas operacionais) — mesmo padrão já usado
//   por `computeLocalCashFlow` acima, sem nenhuma tabela nova.
export function computeLocalDre(organizationId: string, establishmentId: string, from: string, to: string): DreReport {
  const sales = listLocalSalesForReport(organizationId, establishmentId, from, to);
  // sale.total já é líquido de desconto; some o desconto de volta para reconstituir a receita
  // bruta pré-desconto, senão o desconto seria contado duas vezes na Receita líquida.
  const grossRevenue = sales.reduce((sum, sale) => sum + sale.total + sale.discount, 0);
  const discounts = sales.reduce((sum, sale) => sum + sale.discount, 0);
  const refunds = sales.reduce((sum, sale) => sum + sale.refunded, 0);

  // CMV: mesma reconstituição usada pela rota de CMV em modo local — ficha técnica ATUAL do
  // produto aplicada aos itens de cada evento SALE_COMPLETE do período (não há recipeSnapshot por
  // venda em modo local, ver ADR 0026, decisão 6).
  const recipes = listLocalRecipes(establishmentId);
  const cancelledIds = new Set(listLocalAudit({ organizationId, establishmentId, action: "SALE_CANCEL", limit: 5000 }).map(event => event.entityId));
  const completedEvents = listLocalAudit({ organizationId, establishmentId, action: "SALE_COMPLETE", limit: 5000 })
    .filter(event => event.createdAt >= from && event.createdAt <= to)
    .filter(event => !cancelledIds.has(event.entityId));

  const cmvSaleItems: CmvSaleItemInput[] = [];
  for (const event of completedEvents) {
    const after = event.after as { items?: { productId: string; productName: string; quantity: number; unitPrice: number }[] } | undefined;
    for (const item of after?.items ?? []) {
      const recipe = recipes.find(candidate => candidate.productId === item.productId);
      const revenue = item.unitPrice * item.quantity;
      if (!recipe) { cmvSaleItems.push({ productId: item.productId, productName: item.productName, quantity: item.quantity, revenue, recipe: null }); continue; }
      const components = calculateRecipeConsumption(recipe.components.map(component => ({ inventoryItemId: component.inventoryItemId, quantity: component.quantity, wastePercent: component.wastePercent })), item.quantity, recipe.yieldQuantity);
      cmvSaleItems.push({ productId: item.productId, productName: item.productName, quantity: item.quantity, revenue, recipe: { components } });
    }
  }
  const cmvReport = buildCmvReport(cmvSaleItems, inventoryItemId => getLocalAverageCostByInventoryItemId(establishmentId, inventoryItemId));

  // Despesas operacionais / Outras receitas: lançamentos financeiros pagos no período, separados
  // por categoria INCOME/EXPENSE — mesma lógica de `computeLocalCashFlow`.
  const categories = new Map(listLocalFinancialCategories(organizationId).map(category => [category.id, category]));
  let operatingExpenses = 0;
  let otherIncome = 0;
  for (const entry of listLocalFinancialEntries(establishmentId, { status: "PAID" })) {
    if (!entry.paidAt || entry.paidAt < from || entry.paidAt > to) continue;
    const category = categories.get(entry.categoryId);
    if (category?.kind === "INCOME") otherIncome += entry.amount;
    else operatingExpenses += entry.amount;
  }

  return buildDreReport({ grossRevenue, discounts, refunds, cmv: cmvReport.cmvTotal, operatingExpenses, otherIncome });
}
