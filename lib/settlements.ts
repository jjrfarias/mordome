export type SettlementRole = "COURIER" | "WAITER";

export type CommissionRuleInput = {
  amountPerDelivery: number | null;
  percentOfSales: number | null;
};

// Calcula o valor de comissão de um usuário no período, a partir da regra simples configurada
// (ADR 0018): fixo por entrega (entregadores) OU percentual sobre vendas (garçons). Se não houver
// regra, o valor é zero (o usuário ainda aparece na lista de candidatos, ver ADR 0018 decisão 1).
export function calculateCommission(rule: CommissionRuleInput | null, usage: { deliveryCount: number; salesTotal: number }) {
  if (!rule) return 0;
  if (rule.amountPerDelivery !== null && rule.amountPerDelivery !== undefined) {
    return round2(rule.amountPerDelivery * usage.deliveryCount);
  }
  if (rule.percentOfSales !== null && rule.percentOfSales !== undefined) {
    return round2((usage.salesTotal * rule.percentOfSales) / 100);
  }
  return 0;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}
