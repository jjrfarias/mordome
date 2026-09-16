import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { findLocalCouponByCode } from "@/lib/local-coupons";
import { COUPON_VALIDATION_MESSAGES, normalizeCouponCode, validateCoupon, type CouponRecord } from "@/lib/coupons";

// Validação assistida de cupom no PDV (ver ADR 0041): o operador digita o código antes de
// finalizar a venda, esta rota confere se o cupom está utilizável agora (ativo, dentro da
// validade, dentro do limite de usos) e devolve o desconto já calculado para o subtotal informado.
// Não incrementa `usesCount` nem cria `CouponRedemption` — isso só acontece quando a venda é
// efetivamente concluída (`app/api/operations/sales/route.ts`), para não "gastar" um uso de um
// cupom só consultado e não aplicado.
const bodySchema = z.object({ code: z.string().trim().min(1).max(40), subtotal: z.number().finite().positive() });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const code = normalizeCouponCode(parsed.data.code);

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const coupon = findLocalCouponByCode(session.organization.id, code);
    const record: CouponRecord | null = coupon && { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, validFrom: coupon.validFrom, validUntil: coupon.validUntil, maxUses: coupon.maxUses, usesCount: coupon.usesCount, active: coupon.active };
    const result = validateCoupon(record, parsed.data.subtotal);
    if (!result.ok) return Response.json({ error: COUPON_VALIDATION_MESSAGES[result.error] }, { status: 400 });
    return Response.json({ coupon: { id: result.coupon.id, code: result.coupon.code }, discount: result.discount });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  if (!membership) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const coupon = await db.coupon.findFirst({ where: { organizationId: session.organization.id, code } });
  const record: CouponRecord | null = coupon && { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: Number(coupon.discountValue), validFrom: coupon.validFrom?.toISOString() ?? null, validUntil: coupon.validUntil?.toISOString() ?? null, maxUses: coupon.maxUses, usesCount: coupon.usesCount, active: coupon.active };
  const result = validateCoupon(record, parsed.data.subtotal);
  if (!result.ok) return Response.json({ error: COUPON_VALIDATION_MESSAGES[result.error] }, { status: 400 });
  return Response.json({ coupon: { id: result.coupon.id, code: result.coupon.code }, discount: result.discount });
}
