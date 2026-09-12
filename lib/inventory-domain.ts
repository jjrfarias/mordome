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
