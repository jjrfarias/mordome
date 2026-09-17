import { randomUUID } from "node:crypto";

export type LocalPaymentMethod = "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "CASH" | "OTHER";
type Movement = { id: string; type: "SUPPLY" | "WITHDRAWAL"; amount: number; reason: string; createdAt: string };
type CashSession = { id: string; establishmentId: string; operatorId: string; cashFrontId: string | null; status: "OPEN" | "CLOSED"; openingAmount: number; openedAt: string; closedAt?: string; movements: Movement[]; payments: Partial<Record<LocalPaymentMethod, number>>; expectedClosingAmount?: number; closingAmount?: number; differenceAmount?: number; closingBreakdown?: Record<LocalPaymentMethod, number> };
const sessions: CashSession[] = [];
const movementKeys = new Set<string>();

export function getLocalOpenCashSession(establishmentId: string, operatorId: string) {
  return sessions.find(session => session.establishmentId === establishmentId && session.operatorId === operatorId && session.status === "OPEN") ?? null;
}

// Frentes de caixa (ADR 0048): uma frente representa um terminal físico — só uma sessão aberta
// por vez nela, mesmo com operadores diferentes (diferente da regra "uma sessão aberta por
// operador", que continua existindo em paralelo, sem essa checagem se `cashFrontId` não for
// informado).
export function getLocalOpenCashFrontSession(establishmentId: string, cashFrontId: string) {
  return sessions.find(session => session.establishmentId === establishmentId && session.cashFrontId === cashFrontId && session.status === "OPEN") ?? null;
}

export function openLocalCash(establishmentId: string, operatorId: string, openingAmount: number, cashFrontId: string | null = null) {
  if (getLocalOpenCashSession(establishmentId, operatorId)) return null;
  if (cashFrontId && getLocalOpenCashFrontSession(establishmentId, cashFrontId)) return null;
  const session: CashSession = { id: `local-cash-${randomUUID()}`, establishmentId, operatorId, cashFrontId, status: "OPEN", openingAmount, openedAt: new Date().toISOString(), movements: [], payments: {} };
  sessions.push(session);
  return session;
}

export function moveLocalCash(establishmentId: string, operatorId: string, input: { type: "SUPPLY" | "WITHDRAWAL"; amount: number; reason: string; idempotencyKey: string }) {
  const session = getLocalOpenCashSession(establishmentId, operatorId);
  if (!session) return "NO_OPEN_CASH" as const;
  if (movementKeys.has(input.idempotencyKey)) return "DUPLICATE" as const;
  const cashAvailable = session.openingAmount + (session.payments.CASH ?? 0) + session.movements.reduce((sum, movement) => sum + (movement.type === "SUPPLY" ? movement.amount : -movement.amount), 0);
  if (input.type === "WITHDRAWAL" && input.amount > cashAvailable) return "INSUFFICIENT_CASH" as const;
  session.movements.push({ id: `local-cash-movement-${randomUUID()}`, type: input.type, amount: input.amount, reason: input.reason, createdAt: new Date().toISOString() });
  movementKeys.add(input.idempotencyKey); return session;
}

export function registerLocalCashSale(cashSessionId: string, method: LocalPaymentMethod, amount: number) {
  const session = sessions.find(candidate => candidate.id === cashSessionId && candidate.status === "OPEN");
  if (session) session.payments[method] = (session.payments[method] ?? 0) + amount;
}

export function reverseLocalCashSale(cashSessionId: string, method: LocalPaymentMethod, amount: number) {
  const session = sessions.find(candidate => candidate.id === cashSessionId && candidate.status === "OPEN");
  if (!session) return false;
  session.payments[method] = Math.max(0, (session.payments[method] ?? 0) - amount);
  return true;
}

export function registerLocalCashRefund(cashSessionId: string, payments: { method: LocalPaymentMethod; amount: number }[]) {
  const session = sessions.find(candidate => candidate.id === cashSessionId && candidate.status === "OPEN");
  if (!session) return false;
  const cashRefund = payments.filter(payment => payment.method === "CASH").reduce((sum, payment) => sum + payment.amount, 0);
  if (cashRefund > summarizeLocalCash(session).expected.CASH) return "INSUFFICIENT_CASH" as const;
  for (const payment of payments) session.payments[payment.method] = (session.payments[payment.method] ?? 0) - payment.amount;
  return true;
}

export function summarizeLocalCash(session: CashSession) {
  const supplies = session.movements.filter(movement => movement.type === "SUPPLY").reduce((sum, movement) => sum + movement.amount, 0);
  const withdrawals = session.movements.filter(movement => movement.type === "WITHDRAWAL").reduce((sum, movement) => sum + movement.amount, 0);
  const expected = { PIX: session.payments.PIX ?? 0, CREDIT_CARD: session.payments.CREDIT_CARD ?? 0, DEBIT_CARD: session.payments.DEBIT_CARD ?? 0, CASH: session.openingAmount + (session.payments.CASH ?? 0) + supplies - withdrawals, OTHER: session.payments.OTHER ?? 0 };
  return { ...session, expected, expectedTotal: Object.values(expected).reduce((sum, amount) => sum + amount, 0), supplies, withdrawals };
}

export function closeLocalCash(establishmentId: string, operatorId: string, counted: Record<LocalPaymentMethod, number>) {
  const session = getLocalOpenCashSession(establishmentId, operatorId);
  if (!session) return null;
  const summary = summarizeLocalCash(session); const closingAmount = Object.values(counted).reduce((sum, amount) => sum + amount, 0);
  session.status = "CLOSED"; session.closedAt = new Date().toISOString(); session.expectedClosingAmount = summary.expectedTotal; session.closingAmount = closingAmount; session.differenceAmount = closingAmount - summary.expectedTotal; session.closingBreakdown = counted;
  return summarizeLocalCash(session);
}

export function listLocalCashHistory(establishmentId: string) {
  return sessions.filter(session => session.establishmentId === establishmentId).slice(-10).reverse().map(summarizeLocalCash);
}

// Usado pelo fluxo de caixa: retiradas (WITHDRAWAL) e suprimentos (SUPPLY) de todas as sessões
// (abertas ou fechadas) do estabelecimento, dentro do período informado.
export function listLocalCashMovementsForEstablishment(establishmentId: string, from?: string, to?: string) {
  const movements: { id: string; type: "SUPPLY" | "WITHDRAWAL"; amount: number; reason: string; createdAt: string }[] = [];
  for (const session of sessions) {
    if (session.establishmentId !== establishmentId) continue;
    for (const movement of session.movements) {
      if (from && movement.createdAt < from) continue;
      if (to && movement.createdAt > to) continue;
      movements.push(movement);
    }
  }
  return movements;
}
