// Resolução das escolhas de Grupos de ingrediente no momento da venda.
// Ver ADR 0022: grupos pertencem a um produto (não reutilizáveis nesta fatia),
// e o cálculo de preço/validação de min-max é sempre refeito no servidor a partir
// do priceDelta cadastrado — o cliente nunca é a fonte de verdade do preço.

export type IngredientOptionLike = { id: string; name: string; priceDelta: number; active: boolean };
export type IngredientGroupLike = { id: string; name: string; minSelections: number; maxSelections: number; active: boolean; options: IngredientOptionLike[] };
export type OptionSelection = { groupId: string; optionIds: string[] };
export type SelectedOptionSnapshot = { groupName: string; optionName: string; priceDelta: number };

export function resolveIngredientSelections(groups: IngredientGroupLike[], selections: OptionSelection[] | undefined): { snapshot: SelectedOptionSnapshot[]; priceDelta: number } | { error: string } {
  const activeGroups = groups.filter(group => group.active);
  const selectionMap = new Map((selections ?? []).map(selection => [selection.groupId, selection.optionIds]));
  const snapshot: SelectedOptionSnapshot[] = [];
  let priceDelta = 0;

  for (const group of activeGroups) {
    const chosenIds = [...new Set(selectionMap.get(group.id) ?? [])];
    if (chosenIds.length < group.minSelections) return { error: `Selecione ao menos ${group.minSelections} opção(ões) em "${group.name}".` };
    if (chosenIds.length > group.maxSelections) return { error: `Selecione no máximo ${group.maxSelections} opção(ões) em "${group.name}".` };
    for (const optionId of chosenIds) {
      const option = group.options.find(candidate => candidate.id === optionId && candidate.active);
      if (!option) return { error: `Opção inválida em "${group.name}".` };
      snapshot.push({ groupName: group.name, optionName: option.name, priceDelta: option.priceDelta });
      priceDelta += option.priceDelta;
    }
  }

  for (const groupId of selectionMap.keys()) {
    if (!activeGroups.some(group => group.id === groupId)) return { error: "Grupo de ingrediente inválido para este produto." };
  }

  return { snapshot, priceDelta };
}
