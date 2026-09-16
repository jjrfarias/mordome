import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalCancellationReason, listLocalCancellationReasons, updateLocalCancellationReason, type CancellationReasonCategory } from "@/lib/local-cancellation-reasons";

const categoryEnum = z.enum(["SALE_CANCEL", "ITEM_CANCEL", "REFUND"]);

const createSchema = z.object({
  category: categoryEnum,
  label: z.string().trim().min(2).max(120),
});
const updateSchema = z.object({
  reasonId: z.string().min(1),
  label: z.string().trim().min(2).max(120).optional(),
  active: z.boolean().optional(),
}).refine(value => value.label !== undefined || value.active !== undefined, { message: "Informe ao menos um campo para atualizar." });

// GET é liberado para qualquer sessão autenticada da organização: os fluxos de cancelamento
// (venda, item de comanda, reembolso) precisam ler os motivos para montar o seletor, e essa
// não é uma ação administrativa. Criar/editar motivos (POST/PATCH) exige `establishments.manage`,
// mesma permissão usada para as demais configurações administrativas da operação (ver ADR 0029).
async function resolveReader() {
  const session = await getCurrentSession();
  if (!session) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

async function resolveManager() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageEstablishments) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const url = new URL(request.url);
  const categoryParam = url.searchParams.get("category");
  const category = categoryEnum.safeParse(categoryParam).success ? (categoryParam as CancellationReasonCategory) : undefined;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    return Response.json({ reasons: listLocalCancellationReasons(session.organization.id, category) });
  }

  const actor = await resolveReader();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const reasons = await db.cancellationReason.findMany({ where: { organizationId: actor.organization.id, ...(category ? { category } : {}) }, orderBy: [{ category: "asc" }, { label: "asc" }] });
  return Response.json({ reasons });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageEstablishments) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalCancellationReason(session.organization.id, parsed.data);
    if (created === "DUPLICATE") return Response.json({ error: "Já existe um motivo com esse texto nessa categoria." }, { status: 409 });
    return Response.json({ reason: created }, { status: 201 });
  }

  const actor = await resolveManager();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const reason = await db.cancellationReason.create({ data: { organizationId: actor.organization.id, category: parsed.data.category, label: parsed.data.label } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "CancellationReason", entityId: reason.id, reason: `Motivo de cancelamento "${reason.label}" criado` } });
    return Response.json({ reason }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um motivo com esse texto nessa categoria." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar o motivo." }, { status: 500 });
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
    const updated = updateLocalCancellationReason(session.organization.id, data.reasonId, { label: data.label, active: data.active });
    if (updated === "NOT_FOUND") return Response.json({ error: "Motivo não encontrado." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe um motivo com esse texto nessa categoria." }, { status: 409 });
    return Response.json({ reason: updated });
  }

  const actor = await resolveManager();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.cancellationReason.findFirst({ where: { id: data.reasonId, organizationId: actor.organization.id } });
  if (!current) return Response.json({ error: "Motivo não encontrado." }, { status: 404 });

  try {
    const reason = await db.cancellationReason.update({ where: { id: current.id }, data: { label: data.label, active: data.active } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "CancellationReason", entityId: reason.id, reason: `Motivo de cancelamento "${reason.label}" atualizado` } });
    return Response.json({ reason });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um motivo com esse texto nessa categoria." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar o motivo." }, { status: 500 });
  }
}
