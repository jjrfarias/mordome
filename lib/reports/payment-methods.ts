// Cálculo puro do relatório "Vendas por forma de pagamento" (ADR 0035). Diferente dos demais
// relatórios do framework (ADR 0033/0034), que agregam por venda/dia/pessoa, este agrega por
// PAGAMENTO individual (`Payment.method`/`Payment.amount`), não por venda inteira — uma venda com
// split (mais de um pagamento) contribui para cada forma de pagamento envolvida, com o valor
// daquele pagamento específico. Mesmo padrão do restante do framework: puro, sem Prisma/Next,
// testável isoladamente com `node --test`.

import type { SaleRecord } from "./sales.ts";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  CASH: "Dinheiro",
  OTHER: "Outro",
};

export type PaymentMethodsRow = {
  method: string;
  methodLabel: string;
  paymentsCount: number;
  totalAmount: number;
  share: number; // participação sobre o total geral recebido (0 a 1)
};

// Mesmo filtro de "vendas concluídas no período" já usado pelos outros relatórios (COMPLETED/
// PARTIALLY_REFUNDED, excluindo canceladas/totalmente reembolsadas — já aplicado na origem dos
// `SaleRecord`, ver rota/`listLocalSalesForReport`). Não há rateio de reembolso por forma de
// pagamento aqui: `Payment.amount` é o valor efetivamente recebido naquela forma no fechamento da
// venda, e nenhum outro relatório do framework rateia reembolso por forma de pagamento — decisão
// consistente com o restante da fatia.
export function buildPaymentMethodsRows(sales: SaleRecord[]): PaymentMethodsRow[] {
  const byMethod = new Map<string, { method: string; paymentsCount: number; totalAmount: number }>();
  for (const sale of sales) {
    for (const payment of sale.payments ?? []) {
      const row = byMethod.get(payment.method) ?? { method: payment.method, paymentsCount: 0, totalAmount: 0 };
      row.paymentsCount += 1;
      row.totalAmount += payment.amount;
      byMethod.set(payment.method, row);
    }
  }

  const totalAmount = [...byMethod.values()].reduce((sum, row) => sum + row.totalAmount, 0);

  return [...byMethod.values()]
    .map(row => ({
      method: row.method,
      methodLabel: PAYMENT_METHOD_LABELS[row.method] ?? row.method,
      paymentsCount: row.paymentsCount,
      totalAmount: row.totalAmount,
      share: totalAmount > 0 ? row.totalAmount / totalAmount : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export type PaymentMethodsSummary = {
  paymentsCount: number;
  totalAmount: number;
};

export function summarizePaymentMethods(rows: PaymentMethodsRow[]): PaymentMethodsSummary {
  return rows.reduce(
    (acc, row) => ({ paymentsCount: acc.paymentsCount + row.paymentsCount, totalAmount: acc.totalAmount + row.totalAmount }),
    { paymentsCount: 0, totalAmount: 0 },
  );
}
