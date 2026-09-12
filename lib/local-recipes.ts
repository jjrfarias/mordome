type Component = { inventoryItemId: string; inventoryItemName: string; baseUnit: "GRAM" | "MILLILITER" | "UNIT"; quantity: number; wastePercent: number };
type Recipe = { id: string; productId: string; productName: string; name: string; yieldQuantity: number; components: Component[] };

const recipesByEstablishment = new Map<string, Recipe[]>();

export function listLocalRecipes(establishmentId: string) {
  return (recipesByEstablishment.get(establishmentId) ?? []).map(recipe => ({ ...recipe, components: recipe.components.map(component => ({ ...component })) }));
}

export function createLocalRecipe(establishmentId: string, input: Omit<Recipe, "id">) {
  const recipes = recipesByEstablishment.get(establishmentId) ?? [];
  if (recipes.some(recipe => recipe.productId === input.productId)) return null;
  const recipe = { ...input, id: `local-recipe-${randomUUID()}`, components: input.components.map(component => ({ ...component })) };
  recipes.push(recipe);
  recipesByEstablishment.set(establishmentId, recipes);
  return recipe;
}
import { randomUUID } from "node:crypto";
