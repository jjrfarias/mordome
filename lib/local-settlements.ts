import { randomUUID } from "node:crypto";
import { listLocalDeliveredOrders } from "./local-delivery.ts";
import { listLocalFloorSalesForSettlement } from "./local-sales.ts";
import { calculateCommission, type SettlementRole } from "./settlements.ts";

type LocalCommissionRule = { id: string; establishmentId: string; userId: string; role: SettlementRole; amountPerDelivery: number | null; percentOfSales: number | null; createdAt: string };
type LocalSettlementRecord = { id: string; establishmentId: string; userId: string; role: SettlementRole; from: string; to: string; amount: number; paidAt: string; createdById: string };

const rulesByEstablishment = new Map<string, LocalCommissionRule[]>();
const recordsByEstablishment = new Map<string, LocalSettlementRecord[]>();

function bucket<T>(map: Map<string, T[]>, key: string) {
  if (!map.has(key)) map.set(key, []);
  return map.get(key)!;
}

// Regras de comissão (escopo estabelecimento; uma regra ativa por usuário/papel — ADR 0018)
export function listLocalCommissionRules(establishmentId: string) {
  return bucket(rulesByEstablishment, establishmentId).map(item => ({ ...item }));
}

export function createLocalCommissionRule(establishmentId: string, data: { userId: string; role: SettlementRole; amountPerDelivery: number | null; percentOfSales: number | null }) {
  const list = bucket(rulesByEstablishment, establishmentId);
  if (list.some(item => item.userId === data.userId && item.role === data.role)) return "DUPLICATE" as const;
  const rule: LocalCommissionRule = { id: `local-commission-rule-${randomUUID()}`, establishmentId, userId: data.userId, role: data.role, amountPerDelivery: data.amountPerDelivery, percentOfSales: data.percentOfSales, createdAt: new Date().toISOString() };
  list.push(rule);
  return { ...rule };
}

export function updateLocalCommissionRule(establishmentId: string, ruleId: string, data: { amountPerDelivery?: number | null; percentOfSales?: number | null }) {
  const list = bucket(rulesByEstablishment, establishmentId);
  const rule = list.find(item => item.id === ruleId);
  if (!rule) return "NOT_FOUND" as const;
  Object.assign(rule, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
  return { ...rule };
}

// Candidatos ao acerto do período (calculado sob demanda, sem persistência — mesmo padrão do fluxo
// de caixa, ADR 0016). Um usuário sem regra configurada aparece com amount = 0 (ADR 0018 decisão 1).
export function computeLocalSettlementCandidates(establishmentId: string, role: SettlementRole, from: string, to: string) {
  const rules = listLocalCommissionRules(establishmentId).filter(rule => rule.role === role);
  const usageByUser = new Map<string, { deliveryCount: number; salesTotal: number }>();

  if (role === "COURIER") {
    for (const delivery of listLocalDeliveredOrders(establishmentId, from, to)) {
      const usage = usageByUser.get(delivery.courierId) ?? { deliveryCount: 0, salesTotal: 0 };
      usage.deliveryCount += 1;
      usageByUser.set(delivery.courierId, usage);
    }
  } else {
    for (const sale of listLocalFloorSalesForSettlement(establishmentId, from, to)) {
      const usage = usageByUser.get(sale.operatorId) ?? { deliveryCount: 0, salesTotal: 0 };
      usage.salesTotal += sale.total;
      usageByUser.set(sale.operatorId, usage);
    }
  }

  return [...usageByUser.entries()].map(([userId, usage]) => {
    const rule = rules.find(item => item.userId === userId) ?? null;
    return {
      userId,
      role,
      deliveryCount: usage.deliveryCount,
      salesTotal: usage.salesTotal,
      hasRule: Boolean(rule),
      amount: calculateCommission(rule, usage),
    };
  });
}

// Histórico de acertos já pagos
export function listLocalSettlementRecords(establishmentId: string, role?: SettlementRole) {
  return bucket(recordsByEstablishment, establishmentId)
    .filter(item => !role || item.role === role)
    .map(item => ({ ...item }))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export function createLocalSettlementRecord(establishmentId: string, data: { userId: string; role: SettlementRole; from: string; to: string; amount: number; createdById: string }) {
  const list = bucket(recordsByEstablishment, establishmentId);
  if (list.some(item => item.userId === data.userId && item.role === data.role && item.from === data.from && item.to === data.to)) return "DUPLICATE" as const;
  const record: LocalSettlementRecord = { id: `local-settlement-${randomUUID()}`, establishmentId, userId: data.userId, role: data.role, from: data.from, to: data.to, amount: data.amount, paidAt: new Date().toISOString(), createdById: data.createdById };
  list.push(record);
  return { ...record };
}
