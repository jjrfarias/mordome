import { randomUUID } from "node:crypto";
import { convertToBaseUnit, resolvePhysicalCountAdjustment, stockBalance } from "./inventory-domain.ts";
import { weightedAverageCost } from "./cmv.ts";

export type LocalBaseUnit = "GRAM" | "MILLILITER" | "UNIT";
export type LocalTrackingMode = "AUTOMATIC" | "MANUAL" | "NONE";
export type LocalStockMovementType = "ENTRY" | "CONSUMPTION" | "LOSS" | "ADJUSTMENT" | "TRANSFER_IN" | "TRANSFER_OUT" | "REVERSAL" | "PRODUCTION_IN" | "PRODUCTION_OUT";
export type LocalStockMovement = { id: string; type: LocalStockMovementType; quantity: number; unitCost?: number | null; reason?: string | null; sourceType?: string | null; createdAt: string };
type Configuration = { id: string; trackingMode: LocalTrackingMode; minimumStock: number; allowNegative: boolean; movements: LocalStockMovement[] };
type InventoryRecord = { id: string; name: string; baseUnit: LocalBaseUnit; active: boolean; configurations: Map<string, Configuration> };

function createMovement(type: LocalStockMovementType, quantity: number, reason?: string | null, sourceType?: string | null, unitCost?: number | null): LocalStockMovement {
  return { id: `local-stock-movement-${randomUUID()}`, type, quantity, unitCost: unitCost ?? null, reason: reason ?? null, sourceType: sourceType ?? null, createdAt: new Date().toISOString() };
}

const items: InventoryRecord[] = [];
const completedTransfers = new Set<string>();
const completedAdjustments = new Set<string>();

export function defaultConversions(baseUnit: LocalBaseUnit) {
  if (baseUnit === "GRAM") return [{ name: "Grama", symbol: "g", factorToBase: 1 }, { name: "Quilograma", symbol: "kg", factorToBase: 1000 }];
  if (baseUnit === "MILLILITER") return [{ name: "Mililitro", symbol: "ml", factorToBase: 1 }, { name: "Litro", symbol: "L", factorToBase: 1000 }];
  return [{ name: "Unidade", symbol: "un", factorToBase: 1 }];
}

export function listLocalInventory(establishmentId: string) {
  return items.map(item => {
    const configuration = item.configurations.get(establishmentId);
    return {
      id: item.id,
      establishmentItemId: configuration?.id ?? null,
      name: item.name,
      baseUnit: item.baseUnit,
      active: item.active,
      configured: Boolean(configuration),
      trackingMode: configuration?.trackingMode ?? "AUTOMATIC",
      minimumStock: configuration?.minimumStock ?? 0,
      allowNegative: configuration?.allowNegative ?? true,
      balance: configuration ? stockBalance(configuration.movements) : 0,
      conversions: defaultConversions(item.baseUnit),
    };
  });
}

export function createLocalInventoryItem(establishmentId: string, input: { name: string; baseUnit: LocalBaseUnit; trackingMode: LocalTrackingMode; minimumStock: number; allowNegative: boolean }) {
  if (items.some(item => item.name.toLocaleLowerCase("pt-BR") === input.name.toLocaleLowerCase("pt-BR"))) return null;
  const id = `local-inventory-${randomUUID()}`;
  const establishmentItemId = `local-stock-${randomUUID()}`;
  const item: InventoryRecord = { id, name: input.name, baseUnit: input.baseUnit, active: true, configurations: new Map([[establishmentId, { id: establishmentItemId, trackingMode: input.trackingMode, minimumStock: input.minimumStock, allowNegative: input.allowNegative, movements: [] }]]) };
  items.push(item);
  return listLocalInventory(establishmentId).find(row => row.id === id)!;
}

export function configureLocalInventoryItem(establishmentId: string, inventoryItemId: string) {
  const item = items.find(row => row.id === inventoryItemId);
  if (!item) return null;
  if (!item.configurations.has(establishmentId)) item.configurations.set(establishmentId, { id: `local-stock-${randomUUID()}`, trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true, movements: [] });
  return listLocalInventory(establishmentId).find(row => row.id === inventoryItemId)!;
}

export function addLocalStockEntry(establishmentId: string, establishmentItemId: string, quantity: number, factorToBase: number, reason?: string, totalCost?: number) {
  const item = items.find(row => row.configurations.get(establishmentId)?.id === establishmentItemId);
  const configuration = item?.configurations.get(establishmentId);
  if (!item || !configuration) return null;
  const baseQuantity = convertToBaseUnit(quantity, factorToBase);
  const unitCost = totalCost === undefined ? null : totalCost / baseQuantity;
  configuration.movements.push(createMovement("ENTRY", baseQuantity, reason ?? "Entrada de estoque", "MANUAL_ENTRY", unitCost));
  return listLocalInventory(establishmentId).find(row => row.id === item.id)!;
}

export function addLocalStockEntryByEstablishmentItemId(establishmentId: string, establishmentItemId: string, baseQuantity: number, unitCost?: number) {
  const item = items.find(row => row.configurations.get(establishmentId)?.id === establishmentItemId);
  const configuration = item?.configurations.get(establishmentId);
  if (!item || !configuration) return null;
  const movement = createMovement("ENTRY", baseQuantity, "Nota de entrada confirmada", "GOODS_RECEIPT_NOTE", unitCost ?? null);
  configuration.movements.push(movement);
  return { id: movement.id };
}

export function transferLocalStock(input: { sourceEstablishmentId: string; destinationEstablishmentId: string; establishmentItemId: string; quantity: number; factorToBase: number; idempotencyKey: string; reason?: string }) {
  if (input.sourceEstablishmentId === input.destinationEstablishmentId) return "SAME_ESTABLISHMENT" as const;
  if (completedTransfers.has(input.idempotencyKey)) return "DUPLICATE" as const;
  const item = items.find(row => row.configurations.get(input.sourceEstablishmentId)?.id === input.establishmentItemId);
  const source = item?.configurations.get(input.sourceEstablishmentId);
  if (!item || !source) return "NOT_FOUND" as const;
  const baseQuantity = convertToBaseUnit(input.quantity, input.factorToBase);
  const sourceBalance = stockBalance(source.movements);
  if (baseQuantity > sourceBalance) return "INSUFFICIENT_STOCK" as const;
  let destination = item.configurations.get(input.destinationEstablishmentId);
  if (!destination) {
    destination = { id: `local-stock-${randomUUID()}`, trackingMode: source.trackingMode, minimumStock: source.minimumStock, allowNegative: source.allowNegative, movements: [] };
    item.configurations.set(input.destinationEstablishmentId, destination);
  }
  source.movements.push(createMovement("TRANSFER_OUT", -baseQuantity, input.reason, "STOCK_TRANSFER"));
  destination.movements.push(createMovement("TRANSFER_IN", baseQuantity, input.reason, "STOCK_TRANSFER"));
  completedTransfers.add(input.idempotencyKey);
  return { source: listLocalInventory(input.sourceEstablishmentId).find(row => row.id === item.id)!, destination: listLocalInventory(input.destinationEstablishmentId).find(row => row.id === item.id)! };
}

export function adjustLocalStock(input: { establishmentId: string; establishmentItemId: string; kind: "LOSS" | "INTERNAL_CONSUMPTION" | "PHYSICAL_COUNT"; quantity: number; factorToBase: number; idempotencyKey: string; reason?: string }) {
  if (completedAdjustments.has(input.idempotencyKey)) return "DUPLICATE" as const;
  const item = items.find(row => row.configurations.get(input.establishmentId)?.id === input.establishmentItemId);
  const configuration = item?.configurations.get(input.establishmentId);
  if (!item || !configuration) return "NOT_FOUND" as const;
  const balance = stockBalance(configuration.movements);
  if (input.kind === "PHYSICAL_COUNT") {
    const outcome = resolvePhysicalCountAdjustment({ countedQuantity: input.quantity, factorToBase: input.factorToBase, balance, allowNegative: configuration.allowNegative });
    if (!outcome.ok) return "INSUFFICIENT_STOCK" as const;
    configuration.movements.push(createMovement("ADJUSTMENT", outcome.delta, input.reason, "PHYSICAL_COUNT"));
    completedAdjustments.add(input.idempotencyKey);
    return { delta: outcome.delta, balance: outcome.newBalance };
  }
  const converted = convertToBaseUnit(input.quantity, input.factorToBase);
  const delta = -converted;
  if (!configuration.allowNegative && balance + delta < 0) return "INSUFFICIENT_STOCK" as const;
  configuration.movements.push(createMovement(input.kind === "LOSS" ? "LOSS" : "CONSUMPTION", delta, input.reason, input.kind));
  completedAdjustments.add(input.idempotencyKey);
  return { delta, balance: balance + delta };
}

const completedBulkPhysicalCounts = new Set<string>();

/**
 * Aplica uma contagem física de vários itens de uma vez, reaproveitando a mesma
 * fórmula de cálculo (`resolvePhysicalCountAdjustment`) usada pelo ajuste individual
 * (`adjustLocalStock`). Todos os itens são validados antes de qualquer mutação —
 * se um falhar (item inexistente ou estoque negativo não permitido), nada é aplicado.
 */
export function applyLocalBulkPhysicalCount(establishmentId: string, items: { establishmentItemId: string; countedQuantity: number; factorToBase: number }[], idempotencyKey?: string, reason?: string) {
  if (idempotencyKey) {
    if (completedBulkPhysicalCounts.has(idempotencyKey)) return "DUPLICATE" as const;
  }
  const resolved: { configuration: Configuration; establishmentItemId: string; delta: number; newBalance: number }[] = [];
  for (const entry of items) {
    const record = itemsFindByEstablishmentItemId(establishmentId, entry.establishmentItemId);
    if (!record) return { failedEstablishmentItemId: entry.establishmentItemId, reason: "NOT_FOUND" } as const;
    const balance = stockBalance(record.configuration.movements);
    const outcome = resolvePhysicalCountAdjustment({ countedQuantity: entry.countedQuantity, factorToBase: entry.factorToBase, balance, allowNegative: record.configuration.allowNegative });
    if (!outcome.ok) return { failedEstablishmentItemId: entry.establishmentItemId, reason: "NEGATIVE_STOCK" } as const;
    resolved.push({ configuration: record.configuration, establishmentItemId: entry.establishmentItemId, delta: outcome.delta, newBalance: outcome.newBalance });
  }
  for (const entry of resolved) {
    if (entry.delta !== 0) entry.configuration.movements.push(createMovement("ADJUSTMENT", entry.delta, reason, "PHYSICAL_COUNT"));
  }
  if (idempotencyKey) completedBulkPhysicalCounts.add(idempotencyKey);
  return resolved.filter(entry => entry.delta !== 0).map(entry => ({ establishmentItemId: entry.establishmentItemId, delta: entry.delta, balance: entry.newBalance }));
}

function itemsFindByEstablishmentItemId(establishmentId: string, establishmentItemId: string) {
  const item = items.find(row => row.configurations.get(establishmentId)?.id === establishmentItemId);
  const configuration = item?.configurations.get(establishmentId);
  if (!item || !configuration) return null;
  return { item, configuration };
}

export function applyLocalRecipeConsumption(establishmentId: string, consumptions: { inventoryItemId: string; quantity: number }[]) {
  const resolved = consumptions.map(consumption => {
    const item = items.find(candidate => candidate.id === consumption.inventoryItemId);
    const configuration = item?.configurations.get(establishmentId);
    return { consumption, configuration };
  });
  if (resolved.some(entry => !entry.configuration)) return "NOT_CONFIGURED" as const;
  for (const entry of resolved) {
    const configuration = entry.configuration!;
    if (configuration.trackingMode !== "AUTOMATIC") continue;
    const balance = stockBalance(configuration.movements);
    if (!configuration.allowNegative && balance < entry.consumption.quantity) return "INSUFFICIENT_STOCK" as const;
  }
  for (const entry of resolved) if (entry.configuration!.trackingMode === "AUTOMATIC") entry.configuration!.movements.push(createMovement("CONSUMPTION", -entry.consumption.quantity, "Consumo por venda", "SALE"));
  return "APPLIED" as const;
}

export function reverseLocalRecipeConsumption(establishmentId: string, consumptions: { inventoryItemId: string; quantity: number }[]) {
  for (const consumption of consumptions) {
    const configuration = items.find(candidate => candidate.id === consumption.inventoryItemId)?.configurations.get(establishmentId);
    if (configuration?.trackingMode === "AUTOMATIC") configuration.movements.push(createMovement("REVERSAL", consumption.quantity, "Estorno de venda", "SALE"));
  }
}

/**
 * Custo médio ponderado "atual" de um item de estoque numa unidade, calculado a partir de todo
 * o histórico de entradas (`ENTRY`) com custo registrado — usada pelo Relatório de CMV real
 * (ver ADR 0026). `inventoryItemId` é o id do item de catálogo de estoque (`InventoryRecord.id`),
 * o mesmo usado pelos componentes de receita (`RecipeComponentInput.inventoryItemId`), não o id
 * da configuração por unidade (`establishmentItemId`). Retorna `null` quando o item não tem
 * nenhuma entrada com custo registrado (nunca 0 — custo desconhecido é sinalizado, não mascarado).
 */
export function getLocalAverageCostByInventoryItemId(establishmentId: string, inventoryItemId: string): number | null {
  const item = items.find(candidate => candidate.id === inventoryItemId);
  const configuration = item?.configurations.get(establishmentId);
  if (!configuration) return null;
  const costedEntries = configuration.movements
    .filter(movement => movement.type === "ENTRY" && typeof movement.unitCost === "number")
    .map(movement => ({ quantity: movement.quantity, unitCost: movement.unitCost as number }));
  return weightedAverageCost(costedEntries);
}

/**
 * Consulta somente-leitura: movimentos de tipo `CONSUMPTION` (consumo automático por venda, via
 * ficha técnica) de TODOS os insumos configurados de um estabelecimento, dentro de um período —
 * usada pelo relatório "Itens consumidos" (ver ADR 0038). Diferente de
 * `getLocalStockPositionHistory` (que olha um único item), esta função varre todos os itens do
 * catálogo de estoque para montar a base de agregação por insumo. Não inclui `LOSS`/`ADJUSTMENT`/
 * outros tipos — só consumo real por venda.
 */
export function listLocalConsumptionMovements(establishmentId: string, from: Date, to: Date) {
  const result: { inventoryItemId: string; inventoryItemName: string; baseUnit: LocalBaseUnit; quantity: number }[] = [];
  for (const item of items) {
    const configuration = item.configurations.get(establishmentId);
    if (!configuration) continue;
    for (const movement of configuration.movements) {
      if (movement.type !== "CONSUMPTION") continue;
      const at = new Date(movement.createdAt);
      if (at < from || at > to) continue;
      result.push({ inventoryItemId: item.id, inventoryItemName: item.name, baseUnit: item.baseUnit, quantity: movement.quantity });
    }
  }
  return result;
}

/**
 * Consulta somente-leitura: histórico de posição de estoque de um item num período,
 * com saldo acumulado (running balance) calculado a partir do saldo de abertura do
 * período (soma de tudo antes de `from`). Não grava nada — usada pela tela "Histórico
 * de posição" (ver ADR 0025).
 */
export function getLocalStockPositionHistory(establishmentId: string, establishmentItemId: string, from: Date, to: Date) {
  const record = itemsFindByEstablishmentItemId(establishmentId, establishmentItemId);
  if (!record) return null;
  const sorted = [...record.configuration.movements].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const openingBalance = stockBalance(sorted.filter(movement => new Date(movement.createdAt) < from));
  const periodMovements = sorted.filter(movement => { const at = new Date(movement.createdAt); return at >= from && at <= to; });
  let running = openingBalance;
  const rows = periodMovements.map(movement => {
    running = Math.round((running + movement.quantity) * 1000) / 1000;
    return { id: movement.id, type: movement.type, quantity: movement.quantity, reason: movement.reason ?? null, sourceType: movement.sourceType ?? null, createdAt: movement.createdAt, runningBalance: running };
  });
  const totalIn = periodMovements.filter(movement => movement.quantity > 0).reduce((sum, movement) => sum + movement.quantity, 0);
  const totalOut = periodMovements.filter(movement => movement.quantity < 0).reduce((sum, movement) => sum + movement.quantity, 0);
  return { openingBalance, closingBalance: running, totalIn: Math.round(totalIn * 1000) / 1000, totalOut: Math.round(totalOut * 1000) / 1000, movements: rows };
}
