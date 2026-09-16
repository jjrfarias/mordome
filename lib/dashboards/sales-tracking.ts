// Cálculos puros dos dashboards de "Acompanhamento de vendas" (unidade única) e "Acompanhamento de
// vendas multilojas" (consolidado da organização). Ver ADR 0042 (dashboards de vendas).
//
// Diferente dos relatórios (ADR 0033+), dashboards sempre olham para UM dia por vez (não um
// intervalo), então as funções aqui recebem `SaleRecord[]` já filtrados para o dia escolhido —
// nenhuma filtragem por data acontece dentro deste módulo. Reaproveita o mesmo tipo `SaleRecord`
// de `lib/reports/sales.ts` para não duplicar a forma normalizada de venda entre modo Prisma e modo
// local.

import type { SaleRecord } from "@/lib/reports/sales";

export type HourlyRevenuePoint = {
  hour: number; // 0-23
  revenue: number;
  salesCount: number;
};

// Agrega o faturamento líquido (total - refunded) por hora do dia (0-23), a partir de
// `completedAt`. Sempre retorna as 24 horas, mesmo sem vendas em algumas (zero, não omitido) —
// necessário para o gráfico de linha/barras mostrar o dia inteiro.
export function buildHourlyRevenue(sales: SaleRecord[]): HourlyRevenuePoint[] {
  const byHour = new Map<number, HourlyRevenuePoint>();
  for (let hour = 0; hour < 24; hour++) byHour.set(hour, { hour, revenue: 0, salesCount: 0 });
  for (const sale of sales) {
    const hour = new Date(sale.completedAt).getHours();
    const point = byHour.get(hour);
    if (!point) continue;
    point.revenue += sale.total - sale.refunded;
    point.salesCount += 1;
  }
  return [...byHour.values()];
}

export type ChannelRevenuePoint = {
  channel: string;
  revenue: number;
  salesCount: number;
};

const CHANNEL_ORDER = ["POS", "FLOOR", "DELIVERY", "ONLINE"];

// Agrega o faturamento líquido por canal (POS/FLOOR/DELIVERY/ONLINE). Só inclui canais com pelo
// menos uma venda no dia (diferente da agregação por hora/por loja, que sempre mostra todas as
// posições — aqui um canal sem vendas não agrega valor ao gráfico de composição).
export function buildChannelRevenue(sales: SaleRecord[]): ChannelRevenuePoint[] {
  const byChannel = new Map<string, ChannelRevenuePoint>();
  for (const sale of sales) {
    const point = byChannel.get(sale.channel) ?? { channel: sale.channel, revenue: 0, salesCount: 0 };
    point.revenue += sale.total - sale.refunded;
    point.salesCount += 1;
    byChannel.set(sale.channel, point);
  }
  return [...byChannel.values()].sort((a, b) => {
    const orderA = CHANNEL_ORDER.indexOf(a.channel);
    const orderB = CHANNEL_ORDER.indexOf(b.channel);
    if (orderA === -1 && orderB === -1) return a.channel.localeCompare(b.channel);
    if (orderA === -1) return 1;
    if (orderB === -1) return -1;
    return orderA - orderB;
  });
}

export type SalesTrackingKpis = {
  revenue: number;
  salesCount: number;
  averageTicket: number;
};

export function buildSalesTrackingKpis(sales: SaleRecord[]): SalesTrackingKpis {
  const revenue = sales.reduce((sum, sale) => sum + sale.total - sale.refunded, 0);
  const salesCount = sales.length;
  return { revenue, salesCount, averageTicket: salesCount ? revenue / salesCount : 0 };
}

export type StoreRevenuePoint = {
  establishmentId: string;
  establishmentName: string;
  revenue: number;
  salesCount: number;
  averageTicket: number;
};

// Agrega o faturamento líquido do dia por unidade. Recebe a lista de unidades acessíveis à sessão
// (já filtrada por `EstablishmentAccess`/modo local) junto das vendas de cada uma, e SEMPRE retorna
// uma posição por unidade, mesmo com zero vendas — para a unidade não sumir do gráfico comparativo
// (ela pode simplesmente não ter vendido nada no dia, o que é uma informação relevante por si só).
export function buildStoreRevenue(stores: { establishmentId: string; establishmentName: string; sales: SaleRecord[] }[]): StoreRevenuePoint[] {
  return stores.map(store => {
    const revenue = store.sales.reduce((sum, sale) => sum + sale.total - sale.refunded, 0);
    const salesCount = store.sales.length;
    return {
      establishmentId: store.establishmentId,
      establishmentName: store.establishmentName,
      revenue,
      salesCount,
      averageTicket: salesCount ? revenue / salesCount : 0,
    };
  });
}

export type MultiStoreKpis = {
  totalRevenue: number;
  totalSalesCount: number;
  averageTicket: number;
};

export function summarizeMultiStore(storeRevenues: StoreRevenuePoint[]): MultiStoreKpis {
  const totalRevenue = storeRevenues.reduce((sum, store) => sum + store.revenue, 0);
  const totalSalesCount = storeRevenues.reduce((sum, store) => sum + store.salesCount, 0);
  return { totalRevenue, totalSalesCount, averageTicket: totalSalesCount ? totalRevenue / totalSalesCount : 0 };
}
