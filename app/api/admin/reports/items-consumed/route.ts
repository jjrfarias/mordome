import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalConsumptionMovements } from "@/lib/local-inventory";
import { REPORTS_ITEMS_CONSUMED_VIEW } from "@/lib/permissions";
import { buildItemsConsumedRows, summarizeItemsConsumed, type ConsumptionMovementRecord } from "@/lib/reports/items-consumed";
import { businessMonthRange as defaultMonthRange, businessRange } from "@/lib/business-time";

const querySchema = z.object({ from: z.string().min(1).optional(), to: z.string().min(1).optional() });

function resolveRange(from?: string, to?: string) {
  if (!from || !to) {
    const { from: defaultFrom, to: defaultTo } = defaultMonthRange();
    return { fromDate: defaultFrom, toDate: defaultTo };
  }
  return businessRange(from, to);
}

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
    if (!session.permissionKeys.includes(REPORTS_ITEMS_CONSUMED_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const movements = listLocalConsumptionMovements(session.establishment.id, fromDate, toDate);
    const rows = buildItemsConsumedRows(movements);
    return Response.json({ rows, summary: summarizeItemsConsumed(rows), from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissionKeys.includes(REPORTS_ITEMS_CONSUMED_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const movements = await db.stockMovement.findMany({
    where: {
      type: "CONSUMPTION",
      createdAt: { gte: fromDate, lte: toDate },
      establishmentItem: { establishmentId: session.establishment.id },
    },
    include: { establishmentItem: { include: { inventoryItem: true } } },
    orderBy: { createdAt: "asc" },
  });

  const records: ConsumptionMovementRecord[] = movements.map(movement => ({
    inventoryItemId: movement.establishmentItem.inventoryItem.id,
    inventoryItemName: movement.establishmentItem.inventoryItem.name,
    baseUnit: movement.establishmentItem.inventoryItem.baseUnit,
    quantity: Number(movement.quantity),
  }));

  const rows = buildItemsConsumedRows(records);
  return Response.json({ rows, summary: summarizeItemsConsumed(rows), from: fromDate.toISOString(), to: toDate.toISOString() });
}
