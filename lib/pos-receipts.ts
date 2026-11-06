import { addDays, businessDay, cents, validDay } from "./finance-ledger.ts";

export const posMethods = ["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD"] as const;
export const posMethodLabels: Record<string, string> = { CASH: "Dinheiro", PIX: "Pix", DEBIT_CARD: "Cartão de débito", CREDIT_CARD: "Cartão de crédito à vista" };
export type ReceiptRule = { feeRate: string | number | { toString(): string }; settlementDays: number; businessDays: boolean; holidays: string[] };

export function receiptPlan(amount: string | number | { toString(): string }, completedAt: Date | string, rule: ReceiptRule) {
  const grossCents = cents(amount), rateBps = cents(rule.feeRate);
  if (grossCents <= 0 || rateBps < 0 || rateBps >= 10000 || !Number.isInteger(rule.settlementDays) || rule.settlementDays < 0 || rule.settlementDays > 365 || rule.holidays.some(day => !validDay(day))) throw new Error("Regra de recebimento inválida.");
  // BigInt avoids unsafe intermediate multiplication; half-up at one cent.
  const feeCents = Number((BigInt(grossCents) * BigInt(rateBps) + BigInt(5000)) / BigInt(10000));
  const isWorking = (day: string) => ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()) && !rule.holidays.includes(day);
  let dueDate = businessDay(completedAt);
  if (!rule.businessDays) dueDate = addDays(dueDate, rule.settlementDays);
  else {
    let remaining = rule.settlementDays;
    while (remaining > 0) { dueDate = addDays(dueDate, 1); if (isWorking(dueDate)) remaining--; }
    while (!isWorking(dueDate)) dueDate = addDays(dueDate, 1);
  }
  return { grossCents, feeCents, netCents: grossCents - feeCents, dueDate };
}
