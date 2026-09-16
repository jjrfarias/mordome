import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalCoupon, listLocalCoupons, updateLocalCoupon } from "@/lib/local-coupons";
import { normalizeCouponCode } from "@/lib/coupons";

// Cadastro de cupons de desconto (ver ADR 0041). Reaproveita `catalog.manage` — mesma permissão de
// cardápio/promoções — em vez de criar uma permissão dedicada, pois cupom é uma ferramenta
// comercial/promocional do mesmo domínio de quem já configura preços e produtos, não uma
// configuração puramente administrativa (`establishments.manage`) nem financeira (`finance.manage`).

const discountTypeEnum = z.enum(["PERCENT", "FIXED"]);
const isoDate = z.string().trim().min(1).refine(value => !Number.isNaN(new Date(value).getTime()), { message: "Data inválida." });

const createSchema = z.object({
  code: z.string().trim().min(3).max(40),
  discountType: discountTypeEnum,
  discountValue: z.number().finite().positive(),
  validFrom: isoDate.optional().nullable(),
  validUntil: isoDate.optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
}).refine(value => value.discountType !== "PERCENT" || value.discountValue <= 100, { message: "Desconto percentual não pode superar 100%.", path: ["discountValue"] });

const updateSchema = z.object({
  couponId: z.string().min(1),
  active: z.boolean().optional(),
  discountValue: z.number().finite().positive().optional(),
  validFrom: isoDate.optional().nullable(),
  validUntil: isoDate.optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
}).refine(value => value.active !== undefined || value.discountValue !== undefined || value.validFrom !== undefined || value.validUntil !== undefined || value.maxUses !== undefined, { message: "Informe ao menos um campo para atualizar." });

async function resolveManager() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageCatalog) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({ coupons: listLocalCoupons(session.organization.id) });
  }

  const actor = await resolveManager();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const coupons = await db.coupon.findMany({ where: { organizationId: actor.organization.id }, orderBy: { code: "asc" } });
  return Response.json({ coupons });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;
  const code = normalizeCouponCode(data.code);

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalCoupon(session.organization.id, { code, discountType: data.discountType, discountValue: data.discountValue, validFrom: data.validFrom ?? null, validUntil: data.validUntil ?? null, maxUses: data.maxUses ?? null });
    if (created === "DUPLICATE") return Response.json({ error: "Já existe um cupom com esse código." }, { status: 409 });
    return Response.json({ coupon: created }, { status: 201 });
  }

  const actor = await resolveManager();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const coupon = await db.coupon.create({ data: { organizationId: actor.organization.id, code, discountType: data.discountType, discountValue: data.discountValue, validFrom: data.validFrom ? new Date(data.validFrom) : null, validUntil: data.validUntil ? new Date(data.validUntil) : null, maxUses: data.maxUses ?? null } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "Coupon", entityId: coupon.id, reason: `Cupom "${coupon.code}" criado` } });
    return Response.json({ coupon }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um cupom com esse código." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar o cupom." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = updateLocalCoupon(session.organization.id, data.couponId, { active: data.active, discountValue: data.discountValue, validFrom: data.validFrom, validUntil: data.validUntil, maxUses: data.maxUses });
    if (updated === "NOT_FOUND") return Response.json({ error: "Cupom não encontrado." }, { status: 404 });
    return Response.json({ coupon: updated });
  }

  const actor = await resolveManager();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.coupon.findFirst({ where: { id: data.couponId, organizationId: actor.organization.id } });
  if (!current) return Response.json({ error: "Cupom não encontrado." }, { status: 404 });

  const coupon = await db.coupon.update({ where: { id: current.id }, data: { active: data.active, discountValue: data.discountValue, validFrom: data.validFrom === undefined ? undefined : data.validFrom ? new Date(data.validFrom) : null, validUntil: data.validUntil === undefined ? undefined : data.validUntil ? new Date(data.validUntil) : null, maxUses: data.maxUses === undefined ? undefined : data.maxUses } });
  await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "Coupon", entityId: coupon.id, reason: `Cupom "${coupon.code}" atualizado` } });
  return Response.json({ coupon });
}
