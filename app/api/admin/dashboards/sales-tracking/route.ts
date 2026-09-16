import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalSalesForReport } from "@/lib/local-finance";
import { DASHBOARDS_SALES_TRACKING_VIEW } from "@/lib/permissions";
import { buildChannelRevenue, buildHourlyRevenue, buildSalesTrackingKpis } from "@/lib/dashboards/sales-tracking";
import type { SaleRecord } from "@/lib/reports/sales";

const querySchema = z.object({ date: z.string().min(1).optional() });

// Resolve o dia (00:00:00.000 a 23:59:59.999, hora local do servidor) a partir de `?date=` no
// formato YYYY-MM-DD, ou hoje por padrão. Diferente do PeriodFilter dos relatórios (intervalo),
// dashboards sempre olham para UM dia (ADR 0042).
function resolveDay(date?: string) {
  const base = date ? new Date(`${date}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const fromDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  const toDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
  return { fromDate, toDate };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ date: url.searchParams.get("date") ?? undefined });
  if (!parsed.success) return Response.json({ error: "Data inválida." }, { status: 400 });
  const range = resolveDay(parsed.data.date);
  if (!range) return Response.json({ error: "Data inválida." }, { status: 400 });
  const { fromDate, toDate } = range;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.permissionKeys.includes(DASHBOARDS_SALES_TRACKING_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const sales = listLocalSalesForReport(session.organization.id, session.establishment.id, fromDate.toISOString(), toDate.toISOString());
    return Response.json({
      kpis: buildSalesTrackingKpis(sales),
      hourly: buildHourlyRevenue(sales),
      channels: buildChannelRevenue(sales),
      date: fromDate.toISOString().slice(0, 10),
    });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissionKeys.includes(DASHBOARDS_SALES_TRACKING_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const sales = await db.sale.findMany({
    where: { organizationId: session.organization.id, establishmentId: session.establishment.id, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] }, completedAt: { gte: fromDate, lte: toDate } },
    include: { payments: true, refunds: true, tab: { include: { table: true } } },
    orderBy: { completedAt: "asc" },
  });

  const records: SaleRecord[] = sales.map(sale => ({
    id: sale.id,
    completedAt: sale.completedAt.toISOString(),
    channel: sale.channel,
    table: sale.tab?.table.number ?? null,
    payment: sale.payments.map(payment => payment.method).join(" + "),
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    total: Number(sale.total),
    refunded: sale.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0),
  }));

  return Response.json({
    kpis: buildSalesTrackingKpis(records),
    hourly: buildHourlyRevenue(records),
    channels: buildChannelRevenue(records),
    date: fromDate.toISOString().slice(0, 10),
  });
}
