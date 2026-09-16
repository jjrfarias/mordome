import { randomUUID } from "node:crypto";
import { convertToBaseUnit, resolvePhysicalCountAdjustment, stockBalance } from "./inventory-domain.ts";

export type LocalBaseUnit = "GRAM" | "MILLILITER" | "UNIT";
export type LocalTrackingMode = "AUTOMATIC" | "MANUAL" | "NONE";
type Configuration = { id: string; trackingMode: LocalTrackingMode; minimumStock: number; allowNegative: boolean; movements: number[] };
type InventoryRecord = { id: string; name: string; baseUnit: LocalBaseUnit; active: boolean; configurations: Map<string, Configuration> };

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
      balance: configuration ? stockBalance(configuration.movements.map(quantity => ({ quantity }))) : 0,
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

export function addLocalStockEntry(establishmentId: string, establishmentItemId: string, quantity: number, factorToBase: number) {
  const item = items.find(row => row.configurations.get(establishmentId)?.id === establishmentItemId);
  const configuration = item?.configurations.get(establishmentId);
  if (!item || !configuration) return null;
  configuration.movements.push(convertToBaseUnit(quantity, factorToBase));
  return listLocalInventory(establishmentId).find(row => row.id === item.id)!;
}

export function addLocalStockEntryByEstablishmentItemId(establishmentId: string, establishmentItemId: string, baseQuantity: number) {
  const item = items.find(row => row.configurations.get(establishmentId)?.id === establishmentItemId);
  const configuration = item?.configurations.get(establishmentId);
  if (!item || !configuration) return null;
  configuration.movements.push(baseQuantity);
  return { id: `local-stock-movement-${randomUUID()}` };
}

export function transferLocalStock(input: { sourceEstablishmentId: string; destinationEstablishmentId: string; establishmentItemId: string; quantity: number; factorToBase: number; idempotencyKey: string }) {
  if (input.sourceEstablishmentId === input.destinationEstablishmentId) return "SAME_ESTABLISHMENT" as const;
  if (completedTransfers.has(input.idempotencyKey)) return "DUPLICATE" as const;
  const item = items.find(row => row.configurations.get(input.sourceEstablishmentId)?.id === input.establishmentItemId);
  const source = item?.configurations.get(input.sourceEstablishmentId);
  if (!item || !source) return "NOT_FOUND" as const;
  const baseQuantity = convertToBaseUnit(input.quantity, input.factorToBase);
  const sourceBalance = stockBalance(source.movements.map(quantity => ({ quantity })));
  if (baseQuantity > sourceBalance) return "INSUFFICIENT_STOCK" as const;
  let destination = item.configurations.get(input.destinationEstablishmentId);
  if (!destination) {
    destination = { id: `local-stock-${randomUUID()}`, trackingMode: source.trackingMode, minimumStock: source.minimumStock, allowNegative: source.allowNegative, movements: [] };
    item.configurations.set(input.destinationEstablishmentId, destination);
  }
  source.movements.push(-baseQuantity);
  destination.movements.push(baseQuantity);
  completedTransfers.add(input.idempotencyKey);
  return { source: listLocalInventory(input.sourceEstablishmentId).find(row => row.id === item.id)!, destination: listLocalInventory(input.destinationEstablishmentId).find(row => row.id === item.id)! };
}

export function adjustLocalStock(input: { establishmentId: string; establishmentItemId: string; kind: "LOSS" | "INTERNAL_CONSUMPTION" | "PHYSICAL_COUNT"; quantity: number; factorToBase: number; idempotencyKey: string }) {
  if (completedAdjustments.has(input.idempotencyKey)) return "DUPLICATE" as const;
  const item = items.find(row => row.configurations.get(input.establishmentId)?.id === input.establishmentItemId);
  const configuration = item?.configurations.get(input.establishmentId);
  if (!item || !configuration) return "NOT_FOUND" as const;
  const balance = stockBalance(configuration.movements.map(quantity => ({ quantity })));
  if (input.kind === "PHYSICAL_COUNT") {
    const outcome = resolvePhysicalCountAdjustment({ countedQuantity: input.quantity, factorToBase: input.factorToBase, balance, allowNegative: configuration.allowNegative });
    if (!outcome.ok) return "INSUFFICIENT_STOCK" as const;
    configuration.movements.push(outcome.delta);
    completedAdjustments.add(input.idempotencyKey);
    return { delta: outcome.delta, balance: outcome.newBalance };
  }
  const converted = convertToBaseUnit(input.quantity, input.factorToBase);
  const delta = -converted;
  if (!configuration.allowNegative && balance + delta < 0) return "INSUFFICIENT_STOCK" as const;
  configuration.movements.push(delta);
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
export function applyLocalBulkPhysicalCount(establishmentId: string, items: { establishmentItemId: string; countedQuantity: number; factorToBase: number }[], idempotencyKey?: string) {
  if (idempotencyKey) {
    if (completedBulkPhysicalCounts.has(idempotencyKey)) return "DUPLICATE" as const;
  }
  const resolved: { configuration: Configuration; establishmentItemId: string; delta: number; newBalance: number }[] = [];
  for (const entry of items) {
    const record = itemsFindByEstablishmentItemId(establishmentId, entry.establishmentItemId);
    if (!record) return { failedEstablishmentItemId: entry.establishmentItemId, reason: "NOT_FOUND" } as const;
    const balance = stockBalance(record.configuration.movements.map(quantity => ({ quantity })));
    const outcome = resolvePhysicalCountAdjustment({ countedQuantity: entry.countedQuantity, factorToBase: entry.factorToBase, balance, allowNegative: record.configuration.allowNegative });
    if (!outcome.ok) return { failedEstablishmentItemId: entry.establishmentItemId, reason: "NEGATIVE_STOCK" } as const;
    resolved.push({ configuration: record.configuration, establishmentItemId: entry.establishmentItemId, delta: outcome.delta, newBalance: outcome.newBalance });
  }
  for (const entry of resolved) {
    if (entry.delta !== 0) entry.configuration.movements.push(entry.delta);
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
    const balance = stockBalance(configuration.movements.map(quantity => ({ quantity })));
    if (!configuration.allowNegative && balance < entry.consumption.quantity) return "INSUFFICIENT_STOCK" as const;
  }
  for (const entry of resolved) if (entry.configuration!.trackingMode === "AUTOMATIC") entry.configuration!.movements.push(-entry.consumption.quantity);
  return "APPLIED" as const;
}

export function reverseLocalRecipeConsumption(establishmentId: string, consumptions: { inventoryItemId: string; quantity: number }[]) {
  for (const consumption of consumptions) {
    const configuration = items.find(candidate => candidate.id === consumption.inventoryItemId)?.configurations.get(establishmentId);
    if (configuration?.trackingMode === "AUTOMATIC") configuration.movements.push(consumption.quantity);
  }
}
