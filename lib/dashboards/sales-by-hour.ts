// Cálculo puro do dashboard "Vendas por Data/Hora" (ADR 0043, continuação do ADR 0042).
// Diferente de `buildHourlyRevenue` em `lib/dashboards/sales-tracking.ts` (faturamento por hora de
// UM dia), aqui a agregação é sobre um INTERVALO de dias: faturamento MÉDIO por hora do dia,
// calculado sobre todos os dias do período (não só um dia) — abordagem escolhida em vez de um
// heatmap dia da semana × hora por simplicidade de implementação com `recharts` (que não tem um
// componente de heatmap nativo) mantendo o mesmo `<BarChart>` já usado pelos outros dashboards;
// ver ADR 0043 para a justificativa completa. Recebe `SaleRecord[]` já filtrados para o intervalo
// escolhido — nenhuma filtragem por data acontece dentro deste módulo.

import type { SaleRecord } from "@/lib/reports/sales";

export type HourlyAveragePoint = {
  hour: number; // 0-23
  totalRevenue: number; // soma do faturamento líquido daquela hora, em todos os dias do período
  averageRevenue: number; // totalRevenue dividido pela quantidade de dias distintos do período
  salesCount: number;
};

// Agrega o faturamento líquido por hora (0-23) somado sobre TODOS os dias do período, e calcula a
// média dividindo pela quantidade de dias distintos observados nas vendas recebidas — não pela
// duração nominal do período (`to - from`), para um período sem nenhuma venda em alguns dias não
// distorcer a média para baixo por dias que sequer abriram. Sempre retorna as 24 posições, mesmo
// sem venda em algumas (zero, nunca omitida) — mesmo critério de `buildHourlyRevenue`.
export function buildHourlyAverageRevenue(sales: SaleRecord[]): HourlyAveragePoint[] {
  const byHour = new Map<number, { hour: number; totalRevenue: number; salesCount: number }>();
  for (let hour = 0; hour < 24; hour++) byHour.set(hour, { hour, totalRevenue: 0, salesCount: 0 });
  const daysObserved = new Set<string>();
  for (const sale of sales) {
    daysObserved.add(sale.completedAt.slice(0, 10));
    const hour = new Date(sale.completedAt).getHours();
    const point = byHour.get(hour);
    if (!point) continue;
    point.totalRevenue += sale.total - sale.refunded;
    point.salesCount += 1;
  }
  const dayCount = daysObserved.size || 1;
  return [...byHour.values()].map(point => ({
    hour: point.hour,
    totalRevenue: point.totalRevenue,
    averageRevenue: point.totalRevenue / dayCount,
    salesCount: point.salesCount,
  }));
}

export type SalesByHourKpis = {
  peakHour: number | null; // hora com maior faturamento médio, null se nenhuma venda no período
  peakAverageRevenue: number;
  daysObserved: number;
};

// KPI simples de apoio ao gráfico: qual horário do dia costuma faturar mais, em média, no
// período — o número que o dono realmente quer ver de relance ("sexta à noite" vira "21h", por
// exemplo, quando o período cobrir só sextas).
export function summarizeSalesByHour(sales: SaleRecord[], points: HourlyAveragePoint[]): SalesByHourKpis {
  const daysObserved = new Set(sales.map(sale => sale.completedAt.slice(0, 10))).size;
  const peak = points.reduce<HourlyAveragePoint | null>((best, point) => {
    if (!best || point.averageRevenue > best.averageRevenue) return point;
    return best;
  }, null);
  const hasSales = sales.length > 0 && (peak?.averageRevenue ?? 0) > 0;
  return {
    peakHour: hasSales ? peak!.hour : null,
    peakAverageRevenue: hasSales ? peak!.averageRevenue : 0,
    daysObserved,
  };
}
