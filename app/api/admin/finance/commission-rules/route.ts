import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalCommissionRule, listLocalCommissionRules, updateLocalCommissionRule } from "@/lib/local-settlements";
import { listLocalUsers } from "@/lib/local-access-control";

const roleSchema = z.enum(["COURIER", "WAITER"]);

const createSchema = z.object({
  userId: z.string().min(1),
  role: roleSchema,
  amountPerDelivery: z.number().positive().optional(),
  percentOfSales: z.number().positive().max(100).optional(),
}).refine(value => Boolean(value.amountPerDelivery) !== Boolean(value.percentOfSales), {
  message: "Informe um valor fixo por entrega OU um percentual sobre vendas, não os dois.",
});

const updateSchema = z.object({
  ruleId: z.string().min(1),
  amountPerDelivery: z.number().positive().nullable().optional(),
  percentOfSales: z.number().positive().max(100).nullable().optional(),
}).refine(value => value.amountPerDelivery !== undefined || value.percentOfSales !== undefined, {
  message: "Informe ao menos um campo para atualizar.",
}).refine(value => !(value.amountPerDelivery && value.percentOfSales), {
  message: "Informe um valor fixo por entrega OU um percentual sobre vendas, não os dois.",
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageSettlements) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageSettlements) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const users = listLocalUsers().filter(user => user.establishmentIds.includes(session.establishment.id)).map(user => ({ id: user.userId, name: user.name }));
    return Response.json({ rules: listLocalCommissionRules(session.establishment.id), users });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const [rules, accesses] = await Promise.all([
    db.userCommissionRule.findMany({ where: { establishmentId: actor.establishment.id }, orderBy: { createdAt: "asc" } }),
    db.establishmentAccess.findMany({ where: { establishmentId: actor.establishment.id, membership: { organizationId: actor.organization.id, status: MembershipStatus.ACTIVE } }, include: { membership: { include: { user: { select: { id: true, name: true } } } } } }),
  ]);
  const users = accesses.map(access => ({ id: access.membership.user.id, name: access.membership.user.name }));
  return Response.json({ rules, users });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageSettlements) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalCommissionRule(session.establishment.id, { userId: data.userId, role: data.role, amountPerDelivery: data.amountPerDelivery ?? null, percentOfSales: data.percentOfSales ?? null });
    if (created === "DUPLICATE") return Response.json({ error: "Este usuário já possui uma regra de comissão para este papel." }, { status: 409 });
    return Response.json({ rule: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const access = await db.establishmentAccess.findFirst({ where: { establishmentId: actor.establishment.id, membership: { userId: data.userId, organizationId: actor.organization.id, status: MembershipStatus.ACTIVE } } });
  if (!access) return Response.json({ error: "Usuário inválido para esta unidade." }, { status: 400 });
  try {
    const rule = await db.userCommissionRule.create({ data: { establishmentId: actor.establishment.id, userId: data.userId, role: data.role, amountPerDelivery: data.amountPerDelivery, percentOfSales: data.percentOfSales } });
    return Response.json({ rule }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Este usuário já possui uma regra de comissão para este papel." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar a regra de comissão." }, { status: 500 });
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
    if (!session.canManageSettlements) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const { ruleId, ...changes } = data;
    const updated = updateLocalCommissionRule(session.establishment.id, ruleId, changes);
    if (updated === "NOT_FOUND") return Response.json({ error: "Regra de comissão não encontrada." }, { status: 404 });
    return Response.json({ rule: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.userCommissionRule.findFirst({ where: { id: data.ruleId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Regra de comissão não encontrada." }, { status: 404 });
  const rule = await db.userCommissionRule.update({ where: { id: current.id }, data: { amountPerDelivery: data.amountPerDelivery === undefined ? undefined : data.amountPerDelivery, percentOfSales: data.percentOfSales === undefined ? undefined : data.percentOfSales } });
  return Response.json({ rule });
}
