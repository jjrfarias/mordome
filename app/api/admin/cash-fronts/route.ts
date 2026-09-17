import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalCashFront, listLocalCashFronts, updateLocalCashFront } from "@/lib/local-cash-fronts";

const createSchema = z.object({ name: z.string().trim().min(2).max(60) });
const updateSchema = z.object({ cashFrontId: z.string().min(1), name: z.string().trim().min(2).max(60).optional(), active: z.boolean().optional() })
  .refine(value => value.name !== undefined || value.active !== undefined, { message: "Informe ao menos um campo para atualizar." });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageEstablishments) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

// Frentes de caixa (ADR 0048): cadastro por estabelecimento, mesma permissão administrativa já
// usada por Turnos/Motivos de cancelamento (`establishments.manage`) — não é uma ação operacional
// do dia a dia, é estrutura da unidade.
export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageEstablishments) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({ cashFronts: listLocalCashFronts(session.establishment.id) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const cashFronts = await db.cashFront.findMany({ where: { establishmentId: actor.establishment.id }, orderBy: { name: "asc" } });
  return Response.json({ cashFronts });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageEstablishments) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalCashFront(session.establishment.id, parsed.data.name);
    if (created === "DUPLICATE") return Response.json({ error: "Já existe uma frente de caixa com esse nome." }, { status: 409 });
    return Response.json({ cashFront: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const cashFront = await db.cashFront.create({ data: { establishmentId: actor.establishment.id, name: parsed.data.name } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "CashFront", entityId: cashFront.id, reason: `Frente de caixa "${cashFront.name}" criada` } });
    return Response.json({ cashFront }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma frente de caixa com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar a frente de caixa." }, { status: 500 });
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
    if (!session.canManageEstablishments) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = updateLocalCashFront(session.establishment.id, data.cashFrontId, { name: data.name, active: data.active });
    if (updated === "NOT_FOUND") return Response.json({ error: "Frente de caixa não encontrada." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe uma frente de caixa com esse nome." }, { status: 409 });
    return Response.json({ cashFront: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.cashFront.findFirst({ where: { id: data.cashFrontId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Frente de caixa não encontrada." }, { status: 404 });

  try {
    const cashFront = await db.cashFront.update({ where: { id: current.id }, data: { name: data.name, active: data.active } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "CashFront", entityId: cashFront.id, reason: `Frente de caixa "${cashFront.name}" atualizada` } });
    return Response.json({ cashFront });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma frente de caixa com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar a frente de caixa." }, { status: 500 });
  }
}
