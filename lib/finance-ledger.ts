// Amounts enter as decimal strings; every calculation uses integer cents.
export function cents(value: string | number | { toString(): string }): number {
  const text = String(value);
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(text)) throw new Error("Valor monetário inválido.");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  return (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) * (negative ? -1 : 1);
}
export function decimal(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error("Valor monetário fora do limite.");
  return `${value < 0 ? "-" : ""}${Math.floor(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, "0")}`;
}
export function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function businessDay(value: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function addDays(day: string, amount: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
}
export type LedgerAccount = { id: string; name: string; initialBalance: string | number; balanceAsOf: string | null; active: boolean };
export type LedgerEntry = { id: string; description: string; amount: string | number; kind: "INCOME" | "EXPENSE"; dueDate: string; paidAt: string | null; status: "PENDING" | "PAID"; bankAccountId: string | null };

// Historical statements ignore later settlements; opening is the start of the day.
export function ledgerBalanceAt(accounts: LedgerAccount[], entries: LedgerEntry[], day: string, opening = false): number | null {
  if (!validDay(day)) throw new Error("Data inválida.");
  if (!accounts.length || accounts.some(a => !a.balanceAsOf || a.balanceAsOf.slice(0, 10) > day) || entries.some(e => e.status === "PAID" && !e.paidAt)) return null;
  const paid = entries.filter(e => e.status === "PAID" && e.paidAt && (opening ? businessDay(e.paidAt) < day : businessDay(e.paidAt) <= day));
  if (paid.some(e => !accounts.some(a => a.id === e.bankAccountId))) return null;
  const result = accounts.reduce((total, account) => total + cents(account.initialBalance) + paid.filter(e => e.bankAccountId === account.id && businessDay(e.paidAt!) >= account.balanceAsOf!.slice(0, 10)).reduce((sum, e) => sum + cents(e.amount) * (e.kind === "INCOME" ? 1 : -1), 0), 0);
  if (!Number.isSafeInteger(result)) throw new Error("Total fora do limite.");
  return result;
}

export function buildFinanceOverview(accounts: LedgerAccount[], entries: LedgerEntry[], today: string, horizon: number, accountId?: string) {
  if (!validDay(today) || ![7, 15, 30, 60, 90].includes(horizon)) throw new Error("Período inválido.");
  const selectedAccounts = accounts.filter(a => !accountId || a.id === accountId);
  const selected = entries.filter(e => !accountId || e.bankAccountId === accountId);
  const sum = (items: LedgerEntry[]) => items.reduce((total, e) => {
    const next = total + cents(e.amount);
    if (!Number.isSafeInteger(next)) throw new Error("Total fora do limite.");
    return next;
  }, 0);
  const paid = selected.filter(e => e.status === "PAID" && e.paidAt && businessDay(e.paidAt) <= today);
  const accountBalances = selectedAccounts.map(account => {
    const asOf = account.balanceAsOf?.slice(0, 10) ?? null;
    const movements = paid.filter(e => e.bankAccountId === account.id && asOf && businessDay(e.paidAt!) >= asOf);
    const balanceCents = asOf && asOf <= today ? cents(account.initialBalance) + sum(movements.filter(e => e.kind === "INCOME")) - sum(movements.filter(e => e.kind === "EXPENSE")) : null;
    return { ...account, balanceAsOf: asOf, balanceCents };
  });
  const unknownAccounts = accountBalances.filter(a => a.balanceCents === null).length;
  const unassignedPaid = paid.filter(e => !e.bankAccountId || !accounts.some(a => a.id === e.bankAccountId)).length;
  const missingPaidDate = selected.filter(e => e.status === "PAID" && !e.paidAt).length;
  const futurePaid = selected.filter(e => e.status === "PAID" && e.paidAt && businessDay(e.paidAt) > today).length;
  const balanceCents = !accountBalances.length || unknownAccounts || unassignedPaid || missingPaidDate || futurePaid ? null : accountBalances.reduce((n, a) => n + a.balanceCents!, 0);
  const pending = selected.filter(e => e.status === "PENDING");
  const overdue = pending.filter(e => e.dueDate.slice(0, 10) < today);
  const end = addDays(today, horizon - 1);
  const forecastEntries = pending.filter(e => e.dueDate.slice(0, 10) <= end && (e.kind === "EXPENSE" || e.dueDate.slice(0, 10) >= today));
  let running = balanceCents;
  const daily = Array.from({ length: horizon }, (_, i) => {
    const date = addDays(today, i);
    const items = forecastEntries.filter(e => (e.dueDate.slice(0, 10) < today ? today : e.dueDate.slice(0, 10)) === date);
    const incomeCents = sum(items.filter(e => e.kind === "INCOME"));
    const expenseCents = sum(items.filter(e => e.kind === "EXPENSE"));
    if (running !== null) running += incomeCents - expenseCents;
    return { date, incomeCents, expenseCents, balanceCents: running, entryIds: items.map(e => e.id) };
  });
  const month = today.slice(0, 7);
  const monthPaid = paid.filter(e => businessDay(e.paidAt!).startsWith(month));
  return {
    today, end, horizon, balanceCents, accountBalances, daily,
    projectedBalanceCents: running,
    lowestBalanceCents: balanceCents === null ? null : Math.min(balanceCents, ...daily.map(d => d.balanceCents!)),
    incomeCents: sum(forecastEntries.filter(e => e.kind === "INCOME")), expenseCents: sum(forecastEntries.filter(e => e.kind === "EXPENSE")),
    overdueIncomeCents: sum(overdue.filter(e => e.kind === "INCOME")), overdueExpenseCents: sum(overdue.filter(e => e.kind === "EXPENSE")),
    receivedMonthCents: sum(monthPaid.filter(e => e.kind === "INCOME")), paidMonthCents: sum(monthPaid.filter(e => e.kind === "EXPENSE")),
    unknownAccounts, unassignedPaid, missingPaidDate, futurePaid, unassignedPending: pending.filter(e => !e.bankAccountId).length,
    attention: pending.filter(e => e.dueDate.slice(0, 10) <= addDays(today, 6)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 12),
  };
}
