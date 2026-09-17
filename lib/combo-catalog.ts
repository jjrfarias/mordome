// Combos (ADR 0054): um combo é um Product com `isCombo = true` cujos ComboGroup/ComboGroupOption
// são servidos ao carrinho travestidos de IngredientGroup/IngredientOption — mesmo formato que
// resolveIngredientSelections/IngredientPicker já sabem ler, então nenhum desses dois precisou
// mudar. Este módulo centraliza esse mapeamento para não duplicá-lo em cada rota que serve produtos
// (operations/catalog, operations/floor, operations/delivery, operations/sales, public/menu,
// public/orders).
import { Prisma } from "@/generated/prisma/client";

export const comboGroupsInclude = {
  where: { active: true },
  include: { options: { where: { active: true }, include: { optionProduct: { select: { id: true, name: true, active: true } } } } },
} satisfies Prisma.Product$comboGroupsArgs;

type ComboGroupWithOptions = Prisma.ComboGroupGetPayload<{ include: { options: { include: { optionProduct: { select: { id: true; name: true; active: true } } } } } }>;

export function mapComboGroupsToIngredientGroups(groups: ComboGroupWithOptions[]) {
  return groups.map(group => ({
    id: group.id,
    productId: group.productId,
    name: group.name,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    active: group.active,
    options: group.options.map(option => ({ id: option.id, name: option.optionProduct.name, priceDelta: Number(option.priceDelta), active: option.active && option.optionProduct.active })),
  }));
}
