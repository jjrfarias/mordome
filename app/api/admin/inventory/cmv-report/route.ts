import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { defaultMonthRange } from "@/lib/cashflow";
import { buildCmvReport, weightedAverageCost, type CmvSaleItemInput } from "@/lib/cmv";
import { getLocalAverageCostByInventoryItemId } from "@/lib/local-inventory";
import { listLocalAudit } from "@/lib/local-audit";
import { listLocalRecipes } from "@/lib/local-recipes";
import { calculateRecipeConsumption } from "@/lib/inventory-domain";

const querySchema = z.object({ from: z.string().min(1).optional(), to: z.string().min(1).optional() });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canViewFinanceSummary) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

function resolveRange(from?: string, to?: string) {
  if (!from || !to) {
    const { from: defaultFrom, to: defaultTo } = defaultMonthRange();
    return { fromDate: defaultFrom, toDate: defaultTo };
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

type RecipeSnapshot = { recipeId: string; recipeName: string; yieldQuantity: number; components: { inventoryItemId: string; name: string; baseUnit: string; quantity: number; wastePercent: number }[] };

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  if (!parsed.success) return Response.json({ error: "Período inválido." }, { status: 400 });
  const { fromDate, toDate } = resolveRange(parsed.data.from, parsed.data.to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return Response.json({ error: "Período inválido." }, { status: 400 });
  }

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canViewFinanceSummary) return Response.json({ error: "Acesso negado." }, { status: 403 });

    // Modo local não guarda recipeSnapshot por SaleItem (só o modo servidor tem esse retrato).
    // Em vez disso, a ficha técnica ATUAL do produto é usada para reconstituir o consumo de cada
    // linha de venda passada — mesma aproximação já assumida para o custo médio "atual" (ver ADR
    // 0026): não há como saber, sem recipeSnapshot local, qual era a ficha no momento da venda.
    const recipes = listLocalRecipes(session.establishment.id);
    const cancelledIds = new Set(listLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, action: "SALE_CANCEL", limit: 5000 }).map(event => event.entityId));
    const completedEvents = listLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, action: "SALE_COMPLETE", limit: 5000 })
      .filter(event => event.createdAt >= fromDate.toISOString() && event.createdAt <= toDate.toISOString())
      .filter(event => !cancelledIds.has(event.entityId));

    const saleItems: CmvSaleItemInput[] = [];
    for (const event of completedEvents) {
      const after = event.after as { items?: { productId: string; productName: string; quantity: number; unitPrice: number }[] } | undefined;
      for (const item of after?.items ?? []) {
        const recipe = recipes.find(candidate => candidate.productId === item.productId);
        const revenue = item.unitPrice * item.quantity;
        if (!recipe) { saleItems.push({ productId: item.productId, productName: item.productName, quantity: item.quantity, revenue, recipe: null }); continue; }
        const components = calculateRecipeConsumption(recipe.components.map(component => ({ inventoryItemId: component.inventoryItemId, quantity: component.quantity, wastePercent: component.wastePercent })), item.quantity, recipe.yieldQuantity);
        saleItems.push({ productId: item.productId, productName: item.productName, quantity: item.quantity, revenue, recipe: { components } });
      }
    }

    const report = buildCmvReport(saleItems, inventoryItemId => getLocalAverageCostByInventoryItemId(session.establishment.id, inventoryItemId));
    return Response.json({ ...report, from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const [sales, establishmentItems] = await Promise.all([
    db.sale.findMany({
      where: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] }, completedAt: { gte: fromDate, lte: toDate } },
      include: { items: true },
    }),
    db.establishmentInventoryItem.findMany({
      where: { establishmentId: actor.establishment.id },
      select: { inventoryItemId: true, movements: { where: { type: "ENTRY", unitCost: { not: null } }, select: { quantity: true, unitCost: true } } },
    }),
  ]);

  const averageCostByInventoryItemId = new Map<string, number | null>();
  for (const establishmentItem of establishmentItems) {
    const entries = establishmentItem.movements.map(movement => ({ quantity: Number(movement.quantity), unitCost: Number(movement.unitCost) }));
    averageCostByInventoryItemId.set(establishmentItem.inventoryItemId, weightedAverageCost(entries));
  }

  const saleItems: CmvSaleItemInput[] = [];
  for (const sale of sales) {
    for (const item of sale.items) {
      const snapshot = item.recipeSnapshot as RecipeSnapshot | null;
      saleItems.push({
        productId: item.productId,
        productName: item.productName,
        quantity: Number(item.quantity),
        revenue: Number(item.total),
        recipe: snapshot ? { components: snapshot.components.map(component => ({ inventoryItemId: component.inventoryItemId, quantity: component.quantity })) } : null,
      });
    }
  }

  const report = buildCmvReport(saleItems, inventoryItemId => averageCostByInventoryItemId.get(inventoryItemId) ?? null);
  return Response.json({ ...report, from: fromDate.toISOString(), to: toDate.toISOString() });
}
