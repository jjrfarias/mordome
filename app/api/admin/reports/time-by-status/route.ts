import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalOrderTimings } from "@/lib/local-floor";
import { REPORTS_TIME_BY_STATUS_VIEW } from "@/lib/permissions";
import { buildTimeByStatusRows } from "@/lib/reports/time-by-status";
import type { OrderTimingRecord } from "@/lib/reports/order-timing";
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
    if (!session.permissionKeys.includes(REPORTS_TIME_BY_STATUS_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const records: OrderTimingRecord[] = listLocalOrderTimings(session.establishment.id, fromDate, toDate);
    const rows = buildTimeByStatusRows(records);
    return Response.json({ rows, from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissionKeys.includes(REPORTS_TIME_BY_STATUS_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const orders = await db.order.findMany({
    where: {
      sentAt: { gte: fromDate, lte: toDate },
      tab: { establishmentId: session.establishment.id },
    },
    include: { tab: { include: { table: true } }, statusHistory: { orderBy: { createdAt: "asc" } } },
    orderBy: { sentAt: "asc" },
  });

  const records: OrderTimingRecord[] = orders.map(order => ({
    orderId: order.id,
    tableLabel: order.tab.table.isCounter ? "Balcão" : `Mesa ${order.tab.table.number}`,
    history: order.statusHistory.map(entry => ({ status: entry.status, at: entry.createdAt })),
  }));

  const rows = buildTimeByStatusRows(records);
  return Response.json({ rows, from: fromDate.toISOString(), to: toDate.toISOString() });
}
