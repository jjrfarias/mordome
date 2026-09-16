import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalCoupons, listLocalCouponRedemptions } from "@/lib/local-coupons";
import { REPORTS_COUPONS_GENERATED_VIEW } from "@/lib/permissions";
import { buildCouponsGeneratedRows, summarizeCouponsGenerated, type CouponGeneratedRecord, type CouponRedemptionRecord } from "@/lib/reports/coupons-generated";
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
    if (!session.permissionKeys.includes(REPORTS_COUPONS_GENERATED_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const coupons: CouponGeneratedRecord[] = listLocalCoupons(session.organization.id).filter(coupon => new Date(coupon.createdAt) <= toDate);
    const redemptions: CouponRedemptionRecord[] = coupons.flatMap(coupon => listLocalCouponRedemptions(coupon.id, fromDate, toDate).filter(item => item.establishmentId === session.establishment.id).map(item => ({ couponId: coupon.id, discountApplied: item.discountApplied })));
    const rows = buildCouponsGeneratedRows(coupons, redemptions);
    return Response.json({ rows, summary: summarizeCouponsGenerated(rows), from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.permissionKeys.includes(REPORTS_COUPONS_GENERATED_VIEW)) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const coupons = await db.coupon.findMany({ where: { organizationId: session.organization.id, createdAt: { lte: toDate } }, orderBy: { code: "asc" } });
  const redemptionRows = await db.couponRedemption.findMany({ where: { establishmentId: session.establishment.id, createdAt: { gte: fromDate, lte: toDate }, coupon: { organizationId: session.organization.id } } });

  const couponRecords: CouponGeneratedRecord[] = coupons.map(coupon => ({ id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: Number(coupon.discountValue), validFrom: coupon.validFrom?.toISOString() ?? null, validUntil: coupon.validUntil?.toISOString() ?? null, maxUses: coupon.maxUses, usesCount: coupon.usesCount, createdAt: coupon.createdAt.toISOString() }));
  const redemptionRecords: CouponRedemptionRecord[] = redemptionRows.map(redemption => ({ couponId: redemption.couponId, discountApplied: Number(redemption.discountApplied) }));

  const rows = buildCouponsGeneratedRows(couponRecords, redemptionRecords);
  return Response.json({ rows, summary: summarizeCouponsGenerated(rows), from: fromDate.toISOString(), to: toDate.toISOString() });
}
