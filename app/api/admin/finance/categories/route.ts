import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalFinancialCategory, listLocalFinancialCategories, updateLocalFinancialCategory } from "@/lib/local-finance";

const createSchema = z.object({ name: z.string().trim().min(2).max(60), kind: z.enum(["INCOME", "EXPENSE"]) });
const updateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  kind: z.enum(["INCOME", "EXPENSE"]).optional(),
  active: z.boolean().optional(),
}).refine(value => value.name !== undefined || value.kind !== undefined || value.active !== undefined, {
  message: "Informe ao menos um campo para atualizar.",
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageFinance) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({ categories: listLocalFinancialCategories(session.organization.id) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const categories = await db.financialCategory.findMany({ where: { organizationId: actor.organization.id }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  return Response.json({ categories });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalFinancialCategory(session.organization.id, parsed.data.name, parsed.data.kind);
    if (created === "DUPLICATE") return Response.json({ error: "Já existe uma categoria com esse nome e tipo." }, { status: 409 });
    return Response.json({ category: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const category = await db.financialCategory.create({ data: { organizationId: actor.organization.id, name: parsed.data.name, kind: parsed.data.kind } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "FinancialCategory", entityId: category.id, reason: `Categoria financeira "${category.name}" criada` } });
    return Response.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma categoria com esse nome e tipo." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar a categoria." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = updateLocalFinancialCategory(session.organization.id, data.categoryId, { name: data.name, kind: data.kind, active: data.active });
    if (updated === "NOT_FOUND") return Response.json({ error: "Categoria não encontrada." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe uma categoria com esse nome e tipo." }, { status: 409 });
    return Response.json({ category: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.financialCategory.findFirst({ where: { id: data.categoryId, organizationId: actor.organization.id } });
  if (!current) return Response.json({ error: "Categoria não encontrada." }, { status: 404 });

  try {
    const category = await db.financialCategory.update({ where: { id: current.id }, data: { name: data.name, kind: data.kind, active: data.active } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "FinancialCategory", entityId: category.id, reason: `Categoria financeira "${category.name}" atualizada` } });
    return Response.json({ category });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma categoria com esse nome e tipo." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar a categoria." }, { status: 500 });
  }
}
