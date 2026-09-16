// Cálculo puro do relatório "Desempenho por atendente/garçom" (ADR 0034). Separado de
// `lib/reports/sales.ts` porque, ao contrário de Vendas por período/Faturamento por dia (agregação
// temporal), este relatório agrega por PESSOA e por PAPEL OBSERVADO (canal da venda), o que muda o
// formato da linha o suficiente para justificar um arquivo próprio — mesmo padrão de "puro, sem
// Prisma/Next, testável com node --test" do restante do framework.
//
// IMPORTANTE: isto é só uma VISÃO de desempenho (ranking de vendas por pessoa), sem nenhum cálculo
// de comissão. Não confundir com Acertos de entregadores/garçons (ADR 0018, `lib/settlements.ts`),
// que calcula quanto pagar a alguém a partir de `UserCommissionRule`. Aqui não existe conceito de
// comissão, regra de pagamento ou `UserCommissionRule` — apenas quantidade/valor/ticket médio.

import type { SaleRecord } from "./sales.ts";

export type StaffRole = "ATTENDANT" | "WAITER";

export type StaffPerformanceRow = {
  operatorId: string;
  operatorName: string;
  role: StaffRole;
  salesCount: number;
  totalNet: number;
  averageTicket: number;
};

// Mesmo critério de "quem é o operador de uma venda" já usado em todo o sistema: `Sale.operatorId`
// (quem processou o pagamento/fechamento da venda, ver `app/api/operations/sales/route.ts` e ADR
// 0018). O papel observado vem do canal da venda, não de um campo "tipo de usuário" fixo: canal
// `POS` = "Atendente", canal `FLOOR` = "Garçom" — a mesma pessoa pode aparecer nas duas seções se
// operar tanto o PDV quanto o Salão no período. Vendas de `DELIVERY` ficam fora deste relatório
// (não há papel de "atendente"/"garçom" associado a elas). Valor líquido = `total - refunded`,
// mesmo critério do Fluxo de caixa (ADR 0016) e dos demais relatórios (ADR 0033).
export function buildStaffPerformanceRows(sales: SaleRecord[]): StaffPerformanceRow[] {
  const byKey = new Map<string, StaffPerformanceRow>();
  for (const sale of sales) {
    if (!sale.operatorId) continue;
    const role: StaffRole | null = sale.channel === "POS" ? "ATTENDANT" : sale.channel === "FLOOR" ? "WAITER" : null;
    if (!role) continue;
    const key = `${role}:${sale.operatorId}`;
    const row = byKey.get(key) ?? { operatorId: sale.operatorId, operatorName: sale.operatorName || sale.operatorId, role, salesCount: 0, totalNet: 0, averageTicket: 0 };
    row.salesCount += 1;
    row.totalNet += sale.total - sale.refunded;
    byKey.set(key, row);
  }
  return [...byKey.values()]
    .map(row => ({ ...row, averageTicket: row.salesCount ? row.totalNet / row.salesCount : 0 }))
    .sort((a, b) => b.totalNet - a.totalNet);
}

export function filterStaffPerformanceByRole(rows: StaffPerformanceRow[], role: StaffRole): StaffPerformanceRow[] {
  return rows.filter(row => row.role === role);
}
