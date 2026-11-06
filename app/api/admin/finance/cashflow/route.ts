import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalBankAccounts, listLocalFinancialCategories, listLocalFinancialEntries } from "@/lib/local-finance";
import { ledgerBalanceAt, businessDay, cents, validDay } from "@/lib/finance-ledger";

// Compatibility endpoint: the realized flow now shares the ledger used by the overview.
export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const local = isLocalAuthEnabled(), session = local ? await getLocalSession() : await getCurrentSession();
  if (!session?.canViewFinanceCashflow) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const params = new URL(request.url).searchParams, today = businessDay();
  const from = params.get("from") ?? `${today.slice(0, 7)}-01`, to = params.get("to") ?? today;
  if (!validDay(from) || !validDay(to) || from > to || to > today) return Response.json({ error: "Período inválido. O fluxo realizado não inclui datas futuras." }, { status: 400 });
  const scope = { organizationId: session.organization.id, establishmentId: session.establishment.id };
  const data = local ? (() => {
    const categories = listLocalFinancialCategories(scope.organizationId);
    return { accounts: listLocalBankAccounts(scope.establishmentId).map(a => ({ ...a, balanceAsOf: a.balanceAsOf ?? null })), entries: listLocalFinancialEntries(scope.establishmentId).map(e => ({ ...e, kind: categories.find(c => c.id === e.categoryId)!.kind })) };
  })() : await db.$transaction(async tx => {
    const [accounts, entries] = await Promise.all([tx.bankAccount.findMany({ where: { establishmentId: scope.establishmentId, establishment: { organizationId: scope.organizationId } } }), tx.financialEntry.findMany({ where: { ...scope, voidedAt: null }, include: { category: true } })]);
    return { accounts: accounts.map(a => ({ ...a, initialBalance: a.initialBalance.toString(), balanceAsOf: a.balanceAsOf?.toISOString() ?? null })), entries: entries.map(e => ({ ...e, amount: e.amount.toString(), dueDate: e.dueDate.toISOString(), paidAt: e.paidAt?.toISOString() ?? null, kind: e.category.kind })) };
  }, { isolationLevel: "RepeatableRead" });
  const items = data.entries.filter(e => e.status === "PAID" && e.paidAt && businessDay(e.paidAt) >= from && businessDay(e.paidAt) <= to).map(e => ({ id: e.id, date: e.paidAt!, description: e.description, type: e.kind === "INCOME" ? "IN" : "OUT", amount: cents(e.amount) / 100, source: "ENTRY" }));
  const incomeCents = data.entries.filter(e => e.status === "PAID" && e.kind === "INCOME" && e.paidAt && businessDay(e.paidAt) >= from && businessDay(e.paidAt) <= to).reduce((n, e) => n + cents(e.amount), 0);
  const expenseCents = data.entries.filter(e => e.status === "PAID" && e.kind === "EXPENSE" && e.paidAt && businessDay(e.paidAt) >= from && businessDay(e.paidAt) <= to).reduce((n, e) => n + cents(e.amount), 0);
  const opening = ledgerBalanceAt(data.accounts, data.entries, from, true);
  const closing = ledgerBalanceAt(data.accounts, data.entries, to);
  return Response.json({ from, to, items, income: incomeCents / 100, expense: expenseCents / 100, balance: (incomeCents - expenseCents) / 100, openingBalance: opening === null ? null : opening / 100, accumulatedBalance: closing === null ? null : closing / 100, scope: "LEDGER_ONLY" }, { headers: { "Cache-Control": "no-store" } });
}
