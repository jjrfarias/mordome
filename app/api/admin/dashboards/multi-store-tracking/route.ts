import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalSalesForReport } from "@/lib/local-finance";
import { DASHBOARDS_MULTI_STORE_TRACKING_VIEW } from "@/lib/permissions";
import { buildStoreRevenue, summarizeMultiStore } from "@/lib/dashboards/sales-tracking";
import type { SaleRecord } from "@/lib/reports/sales";

const querySchema = z.object({ date: z.string().min(1).optional() });

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

  // Multilojas consolida somente as unidades que a PRÓPRIA sessão enxerga (`session.establishments`,
  // já filtrado por `EstablishmentAccess` no modo servidor e pelo `allowedIds` do usuário local no
  // modo local — mesmo mecanismo já usado pelo seletor de unidade em `app/page.tsx`). Um usuário com
  // acesso a menos de todas as unidades da organização nunca vê as demais aqui (ADR 0042).
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.permissionKeys.includes(DASHBOARDS_MULTI_STORE_TRACKING_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const stores = session.establishments.map(establishment => ({
      establishmentId: establishment.id,
      establishmentName: establishment.name,
      sales: listLocalSalesForReport(session.organization.id, establishment.id, fromDate.toISOString(), toDate.toISOString()),
    }));
    const storeRevenues = buildStoreRevenue(stores);
    return Response.json({ kpis: summarizeMultiStore(storeRevenues), stores: storeRevenues, date: fromDate.toISOString().slice(0, 10) });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissionKeys.includes(DASHBOARDS_MULTI_STORE_TRACKING_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const stores = await Promise.all(session.establishments.map(async establishment => {
    const sales = await db.sale.findMany({
      where: { organizationId: session.organization.id, establishmentId: establishment.id, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] }, completedAt: { gte: fromDate, lte: toDate } },
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
    return { establishmentId: establishment.id, establishmentName: establishment.name, sales: records };
  }));

  const storeRevenues = buildStoreRevenue(stores);
  return Response.json({ kpis: summarizeMultiStore(storeRevenues), stores: storeRevenues, date: fromDate.toISOString().slice(0, 10) });
}
