// Cálculo puro do relatório "Vendas por área de entrega" (ADR 0036). Diferente dos demais
// relatórios do framework (ADR 0033/0034/0035), que agregam por venda/dia/pessoa/forma de
// pagamento, este agrega vendas de DELIVERY concluídas por `DeliveryArea` (ver ADR 0028): nome da
// área, quantidade de pedidos, valor total de produtos (subtotal, sem taxa), total de taxas de
// entrega cobradas e valor total geral (produtos + taxa). Mesmo padrão do restante do framework:
// puro, sem Prisma/Next, testável isoladamente com `node --test`.

import type { SaleRecord } from "./sales.ts";

export const NO_DELIVERY_AREA_LABEL = "Sem área definida";

export type SalesByDeliveryAreaRow = {
  deliveryAreaId: string | null;
  areaName: string;
  ordersCount: number;
  productsTotal: number;
  deliveryFeeTotal: number;
  grandTotal: number;
};

// Considera apenas vendas de delivery (`channel === "DELIVERY"`) já filtradas como "concluídas no
// período" na origem dos `SaleRecord` (COMPLETED/PARTIALLY_REFUNDED, excluindo canceladas e
// totalmente reembolsadas — mesmo filtro do resto do framework). Pedidos de delivery sem área
// vinculada (`deliveryAreaId` ausente/null) caem numa linha própria "Sem área definida", em vez de
// serem descartados. Ordenado por valor total geral decrescente.
export function buildSalesByDeliveryAreaRows(sales: SaleRecord[]): SalesByDeliveryAreaRow[] {
  const byArea = new Map<string, SalesByDeliveryAreaRow>();
  for (const sale of sales) {
    if (sale.channel !== "DELIVERY") continue;
    const key = sale.deliveryAreaId ?? "__NONE__";
    const areaName = sale.deliveryAreaId ? (sale.deliveryAreaName ?? "Área sem nome") : NO_DELIVERY_AREA_LABEL;
    const row = byArea.get(key) ?? { deliveryAreaId: sale.deliveryAreaId ?? null, areaName, ordersCount: 0, productsTotal: 0, deliveryFeeTotal: 0, grandTotal: 0 };
    row.ordersCount += 1;
    row.productsTotal += sale.subtotal;
    row.deliveryFeeTotal += sale.deliveryFee ?? 0;
    row.grandTotal = row.productsTotal + row.deliveryFeeTotal;
    byArea.set(key, row);
  }

  return [...byArea.values()].sort((a, b) => b.grandTotal - a.grandTotal);
}

export type SalesByDeliveryAreaSummary = {
  ordersCount: number;
  productsTotal: number;
  deliveryFeeTotal: number;
  grandTotal: number;
};

export function summarizeSalesByDeliveryArea(rows: SalesByDeliveryAreaRow[]): SalesByDeliveryAreaSummary {
  return rows.reduce(
    (acc, row) => ({
      ordersCount: acc.ordersCount + row.ordersCount,
      productsTotal: acc.productsTotal + row.productsTotal,
      deliveryFeeTotal: acc.deliveryFeeTotal + row.deliveryFeeTotal,
      grandTotal: acc.grandTotal + row.grandTotal,
    }),
    { ordersCount: 0, productsTotal: 0, deliveryFeeTotal: 0, grandTotal: 0 },
  );
}
