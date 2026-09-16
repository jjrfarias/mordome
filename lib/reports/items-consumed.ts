// Cálculo puro do relatório "Itens consumidos" (ADR 0038). Diferente de "Itens vendidos" (ADR 0037,
// que agrega PRODUTOS finais vendidos por receita), este relatório agrega o CONSUMO DE ESTOQUE —
// quantidade de INSUMO (`InventoryItem`) baixada por venda via ficha técnica, não custo/dinheiro
// (isso é o Relatório de CMV, ver ADR 0026/`lib/cmv.ts`). Agrupa `StockMovement`/`LocalStockMovement`
// do tipo `CONSUMPTION` (consumo automático por venda) por insumo, somando o valor absoluto das
// quantidades (armazenadas negativas) e contando o número de movimentações. Mesmo padrão do restante
// do framework: puro, sem Prisma/Next, testável isoladamente com `node --test`.

export type ConsumptionUnit = "GRAM" | "MILLILITER" | "UNIT";

// Um movimento `CONSUMPTION` já filtrado na origem (modo servidor: `StockMovement.type ===
// "CONSUMPTION"`; modo local: `LocalStockMovement.type === "CONSUMPTION"`). `quantity` vem como
// está armazenada (negativa) — a agregação usa o valor absoluto.
export type ConsumptionMovementRecord = {
  inventoryItemId: string;
  inventoryItemName: string;
  baseUnit: ConsumptionUnit;
  quantity: number;
};

export type ItemsConsumedRow = {
  rank: number;
  inventoryItemId: string;
  inventoryItemName: string;
  baseUnit: ConsumptionUnit;
  quantity: number; // soma do valor absoluto consumido no período, positiva
  movementsCount: number;
};

// Agrupa por `inventoryItemId` (não por nome — diferente do ADR 0037, aqui não há snapshot: o
// movimento referencia o insumo vivo do catálogo de estoque, então agrupar pelo id evita duplicar
// linhas se o insumo for renomeado no meio do período). Ordenado por quantidade consumida
// decrescente, com a posição no ranking calculada a partir dessa ordenação.
export function buildItemsConsumedRows(movements: ConsumptionMovementRecord[]): ItemsConsumedRow[] {
  const byItem = new Map<string, { inventoryItemId: string; inventoryItemName: string; baseUnit: ConsumptionUnit; quantity: number; movementsCount: number }>();
  for (const movement of movements) {
    const row = byItem.get(movement.inventoryItemId) ?? { inventoryItemId: movement.inventoryItemId, inventoryItemName: movement.inventoryItemName, baseUnit: movement.baseUnit, quantity: 0, movementsCount: 0 };
    row.quantity += Math.abs(movement.quantity);
    row.movementsCount += 1;
    byItem.set(movement.inventoryItemId, row);
  }

  return [...byItem.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

export type ItemsConsumedSummary = {
  itemsCount: number;
  movementsCount: number;
};

// Não soma quantidade total entre insumos: unidades diferentes (g/ml/un) tornariam a soma sem
// sentido. O resumo se limita a contagens, que fazem sentido independente da unidade.
export function summarizeItemsConsumed(rows: ItemsConsumedRow[]): ItemsConsumedSummary {
  return rows.reduce((acc, row) => ({ itemsCount: acc.itemsCount + 1, movementsCount: acc.movementsCount + row.movementsCount }), { itemsCount: 0, movementsCount: 0 });
}
