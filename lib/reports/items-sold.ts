// Cálculo puro do relatório "Itens vendidos" (ADR 0037). Diferente dos demais relatórios do
// framework (ADR 0033/0034/0035/0036), que agregam por venda/dia/pessoa/forma de pagamento/área de
// entrega, este agrega os ITENS (`SaleItem`) das vendas concluídas por PRODUTO (agrupado pelo nome
// gravado no momento da venda — snapshot, ver ADR 0037 decisão 4): quantidade total vendida, receita
// total (soma bruta de `quantity × unitPrice`, sem descontar reembolso — mesma simplificação já
// aceita pelos ADRs 0035/0036) e preço médio praticado (receita total / quantidade total). Mesmo
// padrão do restante do framework: puro, sem Prisma/Next, testável isoladamente com `node --test`.

import type { SaleRecord } from "./sales.ts";

export type ItemsSoldRow = {
  rank: number;
  productName: string;
  quantity: number;
  revenue: number;
  averagePrice: number;
};

// Considera todos os itens das vendas já filtradas como "concluídas no período" na origem dos
// `SaleRecord` (COMPLETED/PARTIALLY_REFUNDED, excluindo canceladas e totalmente reembolsadas — mesmo
// filtro do resto do framework), sem restrição de canal. Agrupa por `productName` (nome do produto
// no momento da venda). Ordenado por receita total decrescente, com a posição no ranking (1, 2, 3…)
// calculada a partir dessa ordenação.
export function buildItemsSoldRows(sales: SaleRecord[]): ItemsSoldRow[] {
  const byProduct = new Map<string, { productName: string; quantity: number; revenue: number }>();
  for (const sale of sales) {
    for (const item of sale.items ?? []) {
      const row = byProduct.get(item.productName) ?? { productName: item.productName, quantity: 0, revenue: 0 };
      row.quantity += item.quantity;
      row.revenue += item.quantity * item.unitPrice;
      byProduct.set(item.productName, row);
    }
  }

  return [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((row, index) => ({
      rank: index + 1,
      productName: row.productName,
      quantity: row.quantity,
      revenue: row.revenue,
      averagePrice: row.quantity > 0 ? row.revenue / row.quantity : 0,
    }));
}

export type ItemsSoldSummary = {
  quantity: number;
  revenue: number;
};

export function summarizeItemsSold(rows: ItemsSoldRow[]): ItemsSoldSummary {
  return rows.reduce((acc, row) => ({ quantity: acc.quantity + row.quantity, revenue: acc.revenue + row.revenue }), { quantity: 0, revenue: 0 });
}
