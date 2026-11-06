import { db } from "@/lib/db";
import { listLocalBankAccounts, listLocalFinancialCategories, listLocalFinancialEntries } from "@/lib/local-finance";
import { buildFinanceOverview, businessDay } from "@/lib/finance-ledger";

export async function financeOverview(organizationId: string, establishmentId: string, horizon: number, accountId: string | undefined, local: boolean) {
  if (local) {
    const categories = listLocalFinancialCategories(organizationId);
    return buildFinanceOverview(listLocalBankAccounts(establishmentId).map(a => ({ ...a, balanceAsOf: a.balanceAsOf ?? null })), listLocalFinancialEntries(establishmentId).map(e => ({ ...e, kind: categories.find(c => c.id === e.categoryId)!.kind })), businessDay(), horizon, accountId);
  }
  return db.$transaction(async tx => {
    const [accounts, entries] = await Promise.all([
      tx.bankAccount.findMany({ where: { establishmentId, establishment: { organizationId } }, orderBy: { name: "asc" } }),
      tx.financialEntry.findMany({ where: { organizationId, establishmentId, voidedAt: null }, include: { category: true }, orderBy: { dueDate: "asc" } }),
    ]);
    const unconfiguredPosPayments = await tx.payment.count({ where: { financialEntry: null, sale: { organizationId, establishmentId, financeTracked: true, channel: "POS", status: { not: "CANCELLED" } } } });
    const unconfiguredPosRefunds = await tx.refundPayment.count({ where: { financialEntry: null, refund: { sale: { organizationId, establishmentId, financeTracked: true, channel: "POS", status: { not: "CANCELLED" } } } } });
    return { unconfiguredPosPayments, unconfiguredPosRefunds, ...buildFinanceOverview(accounts.map(a => ({ id: a.id, name: a.name, active: a.active, initialBalance: a.initialBalance.toString(), balanceAsOf: a.balanceAsOf?.toISOString() ?? null })), entries.map(e => ({ id: e.id, description: e.description, amount: e.amount.toString(), bankAccountId: e.bankAccountId, kind: e.category.kind, dueDate: e.dueDate.toISOString(), paidAt: e.paidAt?.toISOString() ?? null, status: e.status })), businessDay(), horizon, accountId) };
  }, { isolationLevel: "RepeatableRead" });
}
