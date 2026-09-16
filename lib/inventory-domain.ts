export type RecipeComponentInput = {
  inventoryItemId: string;
  quantity: number;
  wastePercent?: number;
};

const roundStock = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

export function convertToBaseUnit(quantity: number, factorToBase: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("A quantidade deve ser maior que zero.");
  if (!Number.isFinite(factorToBase) || factorToBase <= 0) throw new Error("O fator de conversão deve ser maior que zero.");
  return roundStock(quantity * factorToBase);
}

export function calculateRecipeConsumption(components: RecipeComponentInput[], soldQuantity = 1, recipeYield = 1) {
  if (!Number.isFinite(soldQuantity) || soldQuantity <= 0) throw new Error("A quantidade vendida deve ser maior que zero.");
  if (!Number.isFinite(recipeYield) || recipeYield <= 0) throw new Error("O rendimento da receita deve ser maior que zero.");

  return components.map(component => {
    if (!Number.isFinite(component.quantity) || component.quantity <= 0) throw new Error("A quantidade do componente deve ser maior que zero.");
    const wasteMultiplier = 1 + (component.wastePercent ?? 0) / 100;
    return {
      inventoryItemId: component.inventoryItemId,
      quantity: roundStock(component.quantity * wasteMultiplier * soldQuantity / recipeYield),
    };
  });
}

export function stockBalance(movements: ReadonlyArray<{ quantity: number }>) {
  return roundStock(movements.reduce((total, movement) => total + movement.quantity, 0));
}

/**
 * Regra única de cálculo do delta de uma contagem física de estoque, compartilhada
 * pelo ajuste individual (`ADJUST`/`PHYSICAL_COUNT`) e pelo ajuste em lote
 * (`BULK_PHYSICAL_COUNT`) — nunca duplicar esta fórmula em outro lugar.
 */
export function resolvePhysicalCountAdjustment(input: { countedQuantity: number; factorToBase: number; balance: number; allowNegative: boolean }) {
  if (!Number.isFinite(input.countedQuantity) || input.countedQuantity < 0) throw new Error("A quantidade contada deve ser maior ou igual a zero.");
  if (!Number.isFinite(input.factorToBase) || input.factorToBase <= 0) throw new Error("O fator de conversão deve ser maior que zero.");
  // Diferente de `convertToBaseUnit` (usado por entrada/perda/consumo), uma contagem física
  // aceita quantidade zero — significa que o item acabou (saldo real é zero).
  const converted = roundStock(input.countedQuantity * input.factorToBase);
  const delta = roundStock(converted - input.balance);
  const newBalance = roundStock(input.balance + delta);
  if (!input.allowNegative && newBalance < 0) return { ok: false as const };
  return { ok: true as const, delta, newBalance };
}

/**
 * Sugestão de quantidade a comprar para um item abaixo do mínimo, usada pela Lista de compras
 * (sugestões automáticas). Fórmula simples: `minimumStock - balance`, arredondada para cima na
 * mesma granularidade de 3 casas decimais usada pelo restante do estoque — arredondar para cima
 * garante que a compra sugerida nunca fique abaixo do mínimo por causa de arredondamento (ex.:
 * uma diferença de 0,0004 kg não pode virar sugestão de 0). Decisão documentada no ADR da
 * Lista de compras; sujeita a revisão se o negócio precisar de lotes/embalagens fixas por
 * fornecedor no futuro.
 */
export function suggestedPurchaseQuantity(minimumStock: number, balance: number) {
  const missing = minimumStock - balance;
  if (missing <= 0) return 0;
  return Math.ceil(missing * 1000) / 1000;
}
