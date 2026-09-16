import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalSalesForReport } from "@/lib/local-finance";
import { REPORTS_SALES_BY_PERIOD_VIEW } from "@/lib/permissions";
import { buildSalesByPeriodRows, summarizeSalesByPeriod, type SaleRecord } from "@/lib/reports/sales";
import { defaultMonthRange } from "@/lib/cashflow";

const querySchema = z.object({ from: z.string().min(1).optional(), to: z.string().min(1).optional() });

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
    if (!session.permissionKeys.includes(REPORTS_SALES_BY_PERIOD_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const sales = listLocalSalesForReport(session.organization.id, session.establishment.id, fromDate.toISOString(), toDate.toISOString());
    const rows = buildSalesByPeriodRows(sales);
    return Response.json({ rows, summary: summarizeSalesByPeriod(rows), from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissionKeys.includes(REPORTS_SALES_BY_PERIOD_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });

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

  const rows = buildSalesByPeriodRows(records);
  return Response.json({ rows, summary: summarizeSalesByPeriod(rows), from: fromDate.toISOString(), to: toDate.toISOString() });
}
