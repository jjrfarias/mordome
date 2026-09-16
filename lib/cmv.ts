/**
 * Cálculo puro do Relatório de CMV real (Custo de Mercadoria Vendida) — ver ADR 0026.
 *
 * Limitações assumidas nesta fatia (ver ADR para detalhes):
 * - Custo médio ponderado "atual" (todo o histórico de entradas com custo, não só o período do
 *   relatório) é aplicado até a vendas passadas do período — não há custo histórico por data.
 * - Item sem nenhuma entrada com custo registrado tem custo médio `null` (desconhecido), nunca 0.
 * - Vendas de produto sem ficha técnica não entram no CMV (custo desconhecido para o produto
 *   inteiro), mas aparecem separadamente com quantidade e receita.
 */

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type CostedEntry = { quantity: number; unitCost: number };

/**
 * Custo médio ponderado: soma(quantidade × custo unitário) / soma(quantidade), considerando
 * apenas entradas de estoque (`ENTRY`) que tiveram custo unitário registrado. Retorna `null`
 * quando não há nenhuma entrada com custo — nunca 0, para não mascarar "sem informação" como
 * "grátis".
 */
export function weightedAverageCost(entries: ReadonlyArray<CostedEntry>): number | null {
  const validEntries = entries.filter(entry => Number.isFinite(entry.quantity) && entry.quantity > 0 && Number.isFinite(entry.unitCost));
  const totalQuantity = validEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  if (totalQuantity <= 0) return null;
  const totalValue = validEntries.reduce((sum, entry) => sum + entry.quantity * entry.unitCost, 0);
  return totalValue / totalQuantity;
}

export type CmvRecipeComponent = { inventoryItemId: string; quantity: number };

/**
 * Custo de uma linha de venda (um `SaleItem`) que tem ficha técnica: soma, para cada componente
 * já consumido (quantidade total da linha, com perda técnica e rendimento já aplicados — é o que
 * `recipeSnapshot`/o cálculo de consumo já produz), o custo médio do insumo correspondente.
 * Se QUALQUER componente não tiver custo médio conhecido, o custo da linha é sinalizado como
 * parcial/desconhecido (`hasUnknownCost: true`) — o valor retornado soma só os componentes com
 * custo conhecido, para não confundir "custo parcial" com "custo total real".
 */
export function calculateSaleItemCmv(components: ReadonlyArray<CmvRecipeComponent>, resolveAverageCost: (inventoryItemId: string) => number | null): { cost: number; hasUnknownCost: boolean } {
  let cost = 0;
  let hasUnknownCost = false;
  for (const component of components) {
    const averageCost = resolveAverageCost(component.inventoryItemId);
    if (averageCost === null) { hasUnknownCost = true; continue; }
    cost += component.quantity * averageCost;
  }
  return { cost: roundMoney(cost), hasUnknownCost };
}

export type CmvSaleItemInput = {
  productId: string | null;
  productName: string;
  quantity: number;
  revenue: number;
  /** `null` quando o produto não tem ficha técnica associada. */
  recipe: { components: CmvRecipeComponent[] } | null;
};

export type CmvProductBreakdown = { productId: string | null; productName: string; quantity: number; revenue: number; cmv: number; cmvPercent: number | null; hasUnknownCost: boolean };
export type CmvProductWithoutRecipe = { productId: string | null; productName: string; quantity: number; revenue: number };

export type CmvReport = {
  revenueTotal: number;
  cmvTotal: number;
  cmvPercent: number | null;
  grossMargin: number;
  marginPercent: number | null;
  hasUnknownCost: boolean;
  products: CmvProductBreakdown[];
  productsWithoutRecipe: CmvProductWithoutRecipe[];
};

/**
 * Agrega o CMV de um período a partir das linhas de venda já concluídas (`COMPLETED`/
 * `PARTIALLY_REFUNDED`). `resolveAverageCost` é chamado com o `inventoryItemId` de cada
 * componente de receita e deve devolver o custo médio ponderado (ou `null` se desconhecido) —
 * normalmente construído previamente com `weightedAverageCost` para cada item do estoque.
 *
 * Receita total considera TODAS as linhas de venda do período (com ou sem ficha técnica),
 * porque é a receita realmente faturada. CMV% e Margem% são calculados sobre essa receita total
 * — decisão desta fatia: assim o dono vê o peso real do CMV rastreado sobre o total vendido,
 * e a lista de "vendas sem ficha técnica" já deixa claro que parte da receita não tem custo
 * rastreado (não é tratada como custo zero para fins de CMV%, apenas fica fora do numerador).
 */
export function buildCmvReport(saleItems: ReadonlyArray<CmvSaleItemInput>, resolveAverageCost: (inventoryItemId: string) => number | null): CmvReport {
  const productMap = new Map<string, CmvProductBreakdown>();
  const withoutRecipeMap = new Map<string, CmvProductWithoutRecipe>();
  let revenueTotal = 0;
  let cmvTotal = 0;
  let hasUnknownCost = false;

  for (const item of saleItems) {
    revenueTotal += item.revenue;
    const key = item.productId ?? `__unnamed__:${item.productName}`;
    if (!item.recipe) {
      const existing = withoutRecipeMap.get(key);
      if (existing) { existing.quantity += item.quantity; existing.revenue = roundMoney(existing.revenue + item.revenue); }
      else withoutRecipeMap.set(key, { productId: item.productId, productName: item.productName, quantity: item.quantity, revenue: roundMoney(item.revenue) });
      continue;
    }
    const { cost, hasUnknownCost: itemHasUnknownCost } = calculateSaleItemCmv(item.recipe.components, resolveAverageCost);
    cmvTotal += cost;
    if (itemHasUnknownCost) hasUnknownCost = true;
    const existing = productMap.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.revenue = roundMoney(existing.revenue + item.revenue);
      existing.cmv = roundMoney(existing.cmv + cost);
      existing.hasUnknownCost = existing.hasUnknownCost || itemHasUnknownCost;
    } else {
      productMap.set(key, { productId: item.productId, productName: item.productName, quantity: item.quantity, revenue: roundMoney(item.revenue), cmv: roundMoney(cost), cmvPercent: null, hasUnknownCost: itemHasUnknownCost });
    }
  }

  const products = [...productMap.values()]
    .map(product => ({ ...product, cmvPercent: product.revenue > 0 ? roundMoney((product.cmv / product.revenue) * 100) : null }))
    .sort((a, b) => b.cmv - a.cmv);

  revenueTotal = roundMoney(revenueTotal);
  cmvTotal = roundMoney(cmvTotal);
  const grossMargin = roundMoney(revenueTotal - cmvTotal);

  return {
    revenueTotal,
    cmvTotal,
    cmvPercent: revenueTotal > 0 ? roundMoney((cmvTotal / revenueTotal) * 100) : null,
    grossMargin,
    marginPercent: revenueTotal > 0 ? roundMoney((grossMargin / revenueTotal) * 100) : null,
    hasUnknownCost,
    products,
    productsWithoutRecipe: [...withoutRecipeMap.values()].sort((a, b) => b.revenue - a.revenue),
  };
}
