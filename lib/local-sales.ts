import { randomUUID } from "node:crypto";
import { calculateRecipeConsumption } from "./inventory-domain.ts";
import { applyLocalRecipeConsumption, reverseLocalRecipeConsumption } from "./local-inventory.ts";
import { listLocalCatalog } from "./local-catalog.ts";
import { listLocalRecipes } from "./local-recipes.ts";
import { registerLocalCashRefund, reverseLocalCashSale, type LocalPaymentMethod } from "./local-cash.ts";

type LocalSale = { id: string; idempotencyKey: string; establishmentId: string; channel: "POS" | "FLOOR" | "DELIVERY"; status: "COMPLETED" | "CANCELLED" | "PARTIALLY_REFUNDED" | "REFUNDED"; operatorId: string | null; completedAt: string; consumptions: { inventoryItemId: string; quantity: number }[]; settlement?: { cashSessionId: string; payments: { method: LocalPaymentMethod; amount: number }[]; total: number; refunded: number } };
const sales: LocalSale[] = [];

export function completeLocalSale(input: { establishmentId: string; idempotencyKey: string; channel: "POS" | "FLOOR" | "DELIVERY"; items: { productId: string; quantity: number }[]; operatorId?: string }) {
  const duplicate = sales.find(sale => sale.idempotencyKey === input.idempotencyKey);
  if (duplicate) return { status: "DUPLICATE" as const, sale: duplicate };
  const catalog = listLocalCatalog(input.establishmentId);
  const recipes = listLocalRecipes(input.establishmentId);
  const consumptions = new Map<string, number>();
  for (const requested of input.items) {
    const product = catalog.find(candidate => candidate.id === requested.productId && candidate.channels.includes(input.channel));
    if (!product) return { status: "PRODUCT_NOT_FOUND" as const };
    const recipe = recipes.find(candidate => candidate.productId === requested.productId);
    if (!recipe) continue;
    for (const consumption of calculateRecipeConsumption(recipe.components, requested.quantity, recipe.yieldQuantity)) consumptions.set(consumption.inventoryItemId, (consumptions.get(consumption.inventoryItemId) ?? 0) + consumption.quantity);
  }
  const consumptionList = [...consumptions].map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity }));
  const applied = applyLocalRecipeConsumption(input.establishmentId, consumptionList);
  if (applied !== "APPLIED") return { status: applied };
  const sale: LocalSale = { id: `local-sale-${randomUUID()}`, idempotencyKey: input.idempotencyKey, establishmentId: input.establishmentId, channel: input.channel, status: "COMPLETED", operatorId: input.operatorId ?? null, completedAt: new Date().toISOString(), consumptions: consumptionList };
  sales.push(sale);
  return { status: "COMPLETED" as const, sale };
}

// Vendas de salão (FLOOR) concluídas, usadas pelo acerto de garçons (lib/local-settlements.ts):
// operatorId é quem processou o pagamento da venda (mesmo critério do modo servidor, ver ADR 0018).
export function listLocalFloorSalesForSettlement(establishmentId: string, from: string, to: string) {
  return sales
    .filter(sale => sale.establishmentId === establishmentId && sale.channel === "FLOOR" && sale.operatorId)
    .filter(sale => (sale.status === "COMPLETED" || sale.status === "PARTIALLY_REFUNDED") && sale.completedAt >= from && sale.completedAt <= to)
    .map(sale => ({ operatorId: sale.operatorId as string, total: sale.settlement?.total ?? 0, completedAt: sale.completedAt }));
}

export function findLocalSale(input: { establishmentId: string; saleId: string }) {
  return sales.find(candidate => candidate.id === input.saleId && candidate.establishmentId === input.establishmentId) ?? null;
}

export function findLocalSaleByIdempotency(establishmentId: string, idempotencyKey: string) {
  return sales.find(candidate => candidate.establishmentId === establishmentId && candidate.idempotencyKey === idempotencyKey) ?? null;
}

export function settleLocalSale(saleId: string, settlement: NonNullable<LocalSale["settlement"]> | { cashSessionId: string; method: LocalPaymentMethod; amount: number }) {
  const sale = sales.find(candidate => candidate.id === saleId);
  if (sale) sale.settlement = "method" in settlement ? { cashSessionId: settlement.cashSessionId, payments: [{ method: settlement.method, amount: settlement.amount }], total: settlement.amount, refunded: 0 } : settlement;
}

export function cancelLocalSale(input: { establishmentId: string; saleId: string }) {
  const sale = sales.find(candidate => candidate.id === input.saleId && candidate.establishmentId === input.establishmentId);
  if (!sale) return "NOT_FOUND" as const;
  if (sale.status === "CANCELLED") return "ALREADY_CANCELLED" as const;
  if (sale.settlement && sale.settlement.payments.some(payment => !reverseLocalCashSale(sale.settlement!.cashSessionId, payment.method, payment.amount))) return "CASH_CLOSED" as const;
  reverseLocalRecipeConsumption(input.establishmentId, sale.consumptions);
  sale.status = "CANCELLED";
  return "CANCELLED" as const;
}

export function refundLocalSale(input: { establishmentId: string; saleId: string; cashSessionId: string; amount: number; payments: { method: LocalPaymentMethod; amount: number }[]; restoreStock: boolean }) {
  const sale = sales.find(candidate => candidate.id === input.saleId && candidate.establishmentId === input.establishmentId);
  if (!sale?.settlement || sale.status === "CANCELLED") return "NOT_FOUND" as const;
  const remaining = sale.settlement.total - sale.settlement.refunded;
  if (input.amount > remaining + 0.001) return "AMOUNT_EXCEEDED" as const;
  const cash = registerLocalCashRefund(input.cashSessionId, input.payments);
  if (cash !== true) return cash === "INSUFFICIENT_CASH" ? cash : "CASH_REQUIRED" as const;
  sale.settlement.refunded += input.amount;
  const totalRefund = sale.settlement.refunded >= sale.settlement.total - 0.001;
  if (input.restoreStock && totalRefund) reverseLocalRecipeConsumption(input.establishmentId, sale.consumptions);
  sale.status = totalRefund ? "REFUNDED" : "PARTIALLY_REFUNDED";
  return sale;
}
