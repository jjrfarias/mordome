// Cálculo puro do dashboard "Canais" (ADR 0043, continuação do ADR 0042). Diferente de
// `buildChannelRevenue` em `lib/dashboards/sales-tracking.ts` (composição do canal em UM dia),
// aqui a análise é ao longo de um INTERVALO de dias: evolução diária por canal, participação
// percentual de cada canal no período e ranking. Recebe `SaleRecord[]` já filtrados para o
// intervalo escolhido — nenhuma filtragem por data acontece dentro deste módulo, mesmo contrato
// dos demais cálculos puros do projeto (sem Prisma/Next, testável com `node --test`).

import type { SaleRecord } from "@/lib/reports/sales";

const CHANNEL_ORDER = ["POS", "FLOOR", "DELIVERY", "ONLINE"];

function sortByChannelOrder<T extends { channel: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderA = CHANNEL_ORDER.indexOf(a.channel);
    const orderB = CHANNEL_ORDER.indexOf(b.channel);
    if (orderA === -1 && orderB === -1) return a.channel.localeCompare(b.channel);
    if (orderA === -1) return 1;
    if (orderB === -1) return -1;
    return orderA - orderB;
  });
}

export type ChannelDailyPoint = {
  date: string; // YYYY-MM-DD
} & Record<string, number | string>;

// Faturamento líquido por dia, com uma coluna por canal presente no período (ex.:
// `{ date: "2026-09-10", POS: 120, FLOOR: 80 }`) — formato pronto para um gráfico de
// barras empilhadas/linhas múltiplas do recharts, uma `<Bar>`/`<Line>` por canal. Só ganham
// coluna os canais que aparecem em pelo menos uma venda do período (mesmo critério de
// `buildChannelRevenue`); dias sem nenhuma venda de um canal ficam com 0 nessa coluna, nunca
// omitidos — para a série do canal não "quebrar" no gráfico de linhas.
export function buildChannelDailyRevenue(sales: SaleRecord[]): { channels: string[]; points: ChannelDailyPoint[] } {
  const channelsPresent = new Set<string>();
  const byDay = new Map<string, ChannelDailyPoint>();
  for (const sale of sales) {
    channelsPresent.add(sale.channel);
    const date = sale.completedAt.slice(0, 10);
    const point = byDay.get(date) ?? { date };
    const net = sale.total - sale.refunded;
    point[sale.channel] = (Number(point[sale.channel]) || 0) + net;
    byDay.set(date, point);
  }
  const channels = sortByChannelOrder([...channelsPresent].map(channel => ({ channel }))).map(item => item.channel);
  const points = [...byDay.values()]
    .map(point => {
      const filled: ChannelDailyPoint = { date: point.date as string };
      for (const channel of channels) filled[channel] = Number(point[channel]) || 0;
      return filled;
    })
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
  return { channels, points };
}

export type ChannelKpi = {
  channel: string;
  revenue: number;
  salesCount: number;
  share: number; // participação sobre o faturamento total do período (0 a 1)
};

// Faturamento total e participação percentual de cada canal no período — mesma ideia de "share"
// de `lib/reports/payment-methods.ts` (`buildPaymentMethodsRows`), mas agregando por CANAL de
// venda em vez de forma de pagamento. Só inclui canais com pelo menos uma venda no período
// (mesmo critério de `buildChannelRevenue`); soma das `share` é sempre 1 quando há vendas.
export function buildChannelKpis(sales: SaleRecord[]): ChannelKpi[] {
  const byChannel = new Map<string, { channel: string; revenue: number; salesCount: number }>();
  for (const sale of sales) {
    const row = byChannel.get(sale.channel) ?? { channel: sale.channel, revenue: 0, salesCount: 0 };
    row.revenue += sale.total - sale.refunded;
    row.salesCount += 1;
    byChannel.set(sale.channel, row);
  }
  const totalRevenue = [...byChannel.values()].reduce((sum, row) => sum + row.revenue, 0);
  const rows = [...byChannel.values()].map(row => ({
    channel: row.channel,
    revenue: row.revenue,
    salesCount: row.salesCount,
    share: totalRevenue > 0 ? row.revenue / totalRevenue : 0,
  }));
  return sortByChannelOrder(rows);
}

export type ChannelRanking = ChannelKpi[];

// Ranking de canais por faturamento no período, decrescente — usado pela tabela pequena do
// dashboard (sem `ReportTable`, já que Dashboards não exporta nada, ADR 0042 decisão 1).
export function rankChannels(kpis: ChannelKpi[]): ChannelRanking {
  return [...kpis].sort((a, b) => b.revenue - a.revenue);
}
