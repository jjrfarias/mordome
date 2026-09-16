// Cálculos puros dos relatórios "Vendas por período" e "Faturamento por dia" (ADR 0033). Recebem
// uma lista normalizada de vendas (`SaleRecord`), a mesma forma seja a origem Prisma (produção) ou
// o log de auditoria local (modo local, ver `lib/local-finance.ts`), e produzem linhas prontas para
// a tabela de relatório + resumo. Mantidos sem dependência de Prisma/Next para serem testáveis
// isoladamente com `node --test`.

export type SaleRecord = {
  id: string;
  completedAt: string; // ISO
  channel: string;
  table: number | null;
  payment: string;
  subtotal: number; // valor bruto (antes do desconto)
  discount: number;
  total: number; // valor líquido antes de reembolsos (subtotal - discount, incluindo serviço/entrega)
  refunded: number;
  // Operador que fechou a venda (mesmo critério de `Sale.operatorId` usado pelos Acertos, ADR 0018).
  // Opcionais porque só o relatório de Desempenho por atendente/garçom (ADR 0034) os usa — os
  // relatórios de Vendas por período/Faturamento por dia (ADR 0033) simplesmente os ignoram.
  operatorId?: string | null;
  operatorName?: string | null;
  // Pagamentos individuais da venda (uma venda pode ter mais de um, "split"). Opcional porque só o
  // relatório de Vendas por forma de pagamento (ADR 0035) os usa — os demais relatórios ignoram e
  // continuam usando o campo `payment` (string já concatenada, ex. "PIX + CASH") para exibição.
  payments?: { method: string; amount: number }[];
};

export type SalesByPeriodRow = {
  id: string;
  completedAt: string;
  channel: string;
  table: number | null;
  payment: string;
  gross: number;
  discount: number;
  net: number;
};

export function buildSalesByPeriodRows(sales: SaleRecord[]): SalesByPeriodRow[] {
  return sales
    .map(sale => ({
      id: sale.id,
      completedAt: sale.completedAt,
      channel: sale.channel,
      table: sale.table,
      payment: sale.payment,
      gross: sale.subtotal,
      discount: sale.discount,
      net: sale.total - sale.refunded,
    }))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

export type SalesByPeriodSummary = {
  count: number;
  totalGross: number;
  totalDiscount: number;
  totalNet: number;
  averageTicket: number;
};

export function summarizeSalesByPeriod(rows: SalesByPeriodRow[]): SalesByPeriodSummary {
  const count = rows.length;
  const totalGross = rows.reduce((sum, row) => sum + row.gross, 0);
  const totalDiscount = rows.reduce((sum, row) => sum + row.discount, 0);
  const totalNet = rows.reduce((sum, row) => sum + row.net, 0);
  return { count, totalGross, totalDiscount, totalNet, averageTicket: count ? totalNet / count : 0 };
}

export type RevenueByDayRow = {
  date: string; // YYYY-MM-DD
  salesCount: number;
  gross: number;
  discount: number;
  net: number;
};

export function buildRevenueByDayRows(sales: SaleRecord[]): RevenueByDayRow[] {
  const byDay = new Map<string, RevenueByDayRow>();
  for (const sale of sales) {
    const date = sale.completedAt.slice(0, 10);
    const row = byDay.get(date) ?? { date, salesCount: 0, gross: 0, discount: 0, net: 0 };
    row.salesCount += 1;
    row.gross += sale.subtotal;
    row.discount += sale.discount;
    row.net += sale.total - sale.refunded;
    byDay.set(date, row);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type RevenueByDaySummary = {
  salesCount: number;
  gross: number;
  discount: number;
  net: number;
};

export function summarizeRevenueByDay(rows: RevenueByDayRow[]): RevenueByDaySummary {
  return rows.reduce(
    (acc, row) => ({ salesCount: acc.salesCount + row.salesCount, gross: acc.gross + row.gross, discount: acc.discount + row.discount, net: acc.net + row.net }),
    { salesCount: 0, gross: 0, discount: 0, net: 0 },
  );
}
