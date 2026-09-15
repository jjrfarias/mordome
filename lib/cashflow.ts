export type CashFlowItemSource = "ENTRY" | "SALE" | "CASH_MOVEMENT";
export type CashFlowItemType = "IN" | "OUT";

export type CashFlowItem = {
  id: string;
  date: string; // ISO string
  description: string;
  type: CashFlowItemType;
  amount: number;
  source: CashFlowItemSource;
};

export function summarizeCashFlow(items: CashFlowItem[]) {
  const income = items.filter(item => item.type === "IN").reduce((sum, item) => sum + item.amount, 0);
  const expense = items.filter(item => item.type === "OUT").reduce((sum, item) => sum + item.amount, 0);
  return {
    income,
    expense,
    balance: income - expense,
    items: [...items].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function defaultMonthRange(reference = new Date()) {
  const from = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const to = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}
