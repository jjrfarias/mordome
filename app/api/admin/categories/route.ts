import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalCategory, listLocalCategories, setLocalCategoryOrder } from "@/lib/local-catalog";
import { slugify } from "@/lib/auth-validation";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";
import { isCompleteOrder } from "@/lib/category-order";

// Ordem das categorias no cardápio e na vitrine (ADR 0058). As categorias pertencem à organização;
// a organização vem sempre da sessão, nunca do corpo da requisição.
const orderSchema = z.object({ order: z.array(z.string().trim().min(1).max(100)).min(1).max(200) });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

async function listCategories(organizationId: string) {
  const categories = await db.category.findMany({
    where: { organizationId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, _count: { select: { products: true } } },
  });
  return categories.map(category => ({ id: category.id, name: category.name, productCount: category._count.products }));
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    if (!await getLocalSession()) return Response.json({ error: "Não autenticado." }, { status: 401 });
    return Response.json({ categories: listLocalCategories() });
  }
  const session = await resolveActor();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
  return Response.json({ categories: await listCategories(session.organization.id) });
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ordem de categorias inválida." }, { status: 400 });
  const { order } = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const before = listLocalCategories();
    if (!isCompleteOrder(order, before.map(category => category.id))) return Response.json({ error: "A lista de categorias mudou. Recarregue a página e tente novamente." }, { status: 409 });
    const categories = setLocalCategoryOrder(order);
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "UPDATE", entityType: "Category", entityId: "ordem", reason: "Reordenação das categorias do cardápio", before: { order: before.map(category => category.name) }, after: { order }, ...requestAuditMetadata(request) });
    return Response.json({ categories });
  }

  const session = await resolveActor();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
  const organizationId = session.organization.id;

  const categories = await db.$transaction(async tx => {
    const current = await tx.category.findMany({ where: { organizationId, active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
    if (!isCompleteOrder(order, current.map(category => category.id))) return null;
    // `where` com organizationId em cada update: mesmo um id válido de outra organização nunca é tocado.
    for (const [index, id] of order.entries()) await tx.category.updateMany({ where: { id, organizationId }, data: { sortOrder: index + 1 } });
    await tx.auditEvent.create({ data: { organizationId, establishmentId: session.establishment.id, actorId: session.user.id, action: "UPDATE", entityType: "Category", entityId: "ordem", reason: "Reordenação das categorias do cardápio", before: { order: current.map(category => category.name) }, after: { order: order.map(id => current.find(category => category.id === id)!.name) }, ...requestAuditMetadata(request) } });
    return true;
  });
  if (!categories) return Response.json({ error: "A lista de categorias mudou. Recarregue a página e tente novamente." }, { status: 409 });
  return Response.json({ categories: await listCategories(organizationId) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = z.object({ name: z.string().trim().min(2).max(80).refine(name => slugify(name).length > 0) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Informe um nome de categoria com 2 a 80 caracteres." }, { status: 400 });
  const { name } = parsed.data;
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
    if (listLocalCategories().some(category => slugify(category.name) === slugify(name))) return Response.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 });
    const category = createLocalCategory(name);
    if (!category) return Response.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "CREATE", entityType: "Category", entityId: category.id, reason: "Cadastro de categoria", after: category, ...requestAuditMetadata(request) });
    return Response.json({ category }, { status: 201 });
  }
  const session = await resolveActor();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
  try {
    const category = await db.$transaction(async tx => {
      const last = await tx.category.aggregate({ where: { organizationId: session.organization.id }, _max: { sortOrder: true } });
      const created = await tx.category.create({ data: { organizationId: session.organization.id, name, slug: slugify(name), sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "CREATE", entityType: "Category", entityId: created.id, reason: "Cadastro de categoria", after: { name }, ...requestAuditMetadata(request) } });
      return created;
    });
    return Response.json({ category: { id: category.id, name: category.name, productCount: 0 } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível cadastrar a categoria." }, { status: 500 });
  }
}
