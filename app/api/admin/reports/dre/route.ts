import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { computeLocalDre } from "@/lib/local-finance";
import { REPORTS_DRE_VIEW } from "@/lib/permissions";
import { buildCmvReport, weightedAverageCost, type CmvSaleItemInput } from "@/lib/cmv";
import { buildDreReport } from "@/lib/reports/dre";
import { defaultMonthRange } from "@/lib/cashflow";

const querySchema = z.object({ from: z.string().min(1).optional(), to: z.string().min(1).optional() });

function resolveRange(from?: string, to?: string) {
  if (!from || !to) {
    const { from: defaultFrom, to: defaultTo } = defaultMonthRange();
    return { fromDate: defaultFrom, toDate: defaultTo };
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setUTCHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

type RecipeSnapshot = { recipeId: string; recipeName: string; yieldQuantity: number; components: { inventoryItemId: string; name: string; baseUnit: string; quantity: number; wastePercent: number }[] };

// DRE Gerencial/Financeira simplificada (ADR 0040) — GET /api/admin/reports/dre?from=&to=.
// Cruza vendas concluídas do período (Receita bruta/Descontos/Reembolsos), o Relatório de CMV já
// existente (`lib/cmv.ts`, ADR 0026) e lançamentos financeiros pagos por categoria (mesma lógica já
// usada pelo Fluxo de caixa, ADR 0016) — nenhuma dessas três fontes é recalculada aqui, só
// consultada e repassada para `buildDreReport` (`lib/reports/dre.ts`), que monta a demonstração.
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
    if (!session.permissionKeys.includes(REPORTS_DRE_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const report = computeLocalDre(session.organization.id, session.establishment.id, fromDate.toISOString(), toDate.toISOString());
    return Response.json({ ...report, from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissionKeys.includes(REPORTS_DRE_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const [sales, establishmentItems, financialEntries] = await Promise.all([
    db.sale.findMany({
      where: { organizationId: session.organization.id, establishmentId: session.establishment.id, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] }, completedAt: { gte: fromDate, lte: toDate } },
      include: { items: true, refunds: true },
    }),
    db.establishmentInventoryItem.findMany({
      where: { establishmentId: session.establishment.id },
      select: { inventoryItemId: true, movements: { where: { type: "ENTRY", unitCost: { not: null } }, select: { quantity: true, unitCost: true } } },
    }),
    db.financialEntry.findMany({
      where: { establishmentId: session.establishment.id, status: "PAID", paidAt: { gte: fromDate, lte: toDate } },
      include: { category: true },
    }),
  ]);

  // Receita bruta/Descontos/Reembolsos: direto de `Sale`/`Refund`, mesmos campos já usados por
  // `lib/reports/sales.ts` para os demais relatórios de vendas.
  let grossRevenue = 0;
  let discounts = 0;
  let refunds = 0;
  const cmvSaleItems: CmvSaleItemInput[] = [];
  for (const sale of sales) {
    // Sale.total já é líquido de desconto (total = grossTotal - discount), então a receita bruta
    // precisa reconstituir o valor pré-desconto somando de volta — senão o desconto seria
    // descontado duas vezes na Receita líquida (uma dentro de `total`, outra na linha "Descontos").
    grossRevenue += Number(sale.total) + Number(sale.discount);
    discounts += Number(sale.discount);
    refunds += sale.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
    for (const item of sale.items) {
      const snapshot = item.recipeSnapshot as RecipeSnapshot | null;
      cmvSaleItems.push({
        productId: item.productId,
        productName: item.productName,
        quantity: Number(item.quantity),
        revenue: Number(item.total),
        recipe: snapshot ? { components: snapshot.components.map(component => ({ inventoryItemId: component.inventoryItemId, quantity: component.quantity })) } : null,
      });
    }
  }

  // CMV: mesmo custo médio ponderado por insumo (`weightedAverageCost`) e mesma agregação
  // (`buildCmvReport`) usados pela rota de CMV (`app/api/admin/inventory/cmv-report/route.ts`).
  const averageCostByInventoryItemId = new Map<string, number | null>();
  for (const establishmentItem of establishmentItems) {
    const entries = establishmentItem.movements.map(movement => ({ quantity: Number(movement.quantity), unitCost: Number(movement.unitCost) }));
    averageCostByInventoryItemId.set(establishmentItem.inventoryItemId, weightedAverageCost(entries));
  }
  const cmvReport = buildCmvReport(cmvSaleItems, inventoryItemId => averageCostByInventoryItemId.get(inventoryItemId) ?? null);

  // Despesas operacionais / Outras receitas: lançamentos financeiros pagos no período, separados
  // por categoria INCOME/EXPENSE — mesma lógica já usada pelo Fluxo de caixa.
  let operatingExpenses = 0;
  let otherIncome = 0;
  for (const entry of financialEntries) {
    if (entry.category.kind === "INCOME") otherIncome += Number(entry.amount);
    else operatingExpenses += Number(entry.amount);
  }

  const report = buildDreReport({ grossRevenue, discounts, refunds, cmv: cmvReport.cmvTotal, operatingExpenses, otherIncome });
  return Response.json({ ...report, from: fromDate.toISOString(), to: toDate.toISOString() });
}
