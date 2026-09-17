import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalCustomer, listLocalCustomers, updateLocalCustomer } from "@/lib/local-customers";
import { getLocalCustomerOrderStats } from "@/lib/local-delivery";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  email: z.string().trim().email().max(120).optional(),
  document: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(500).optional(),
});
const updateSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).max(20).optional(),
  email: z.union([z.string().trim().email().max(120), z.null()]).optional(),
  document: z.union([z.string().trim().max(30), z.null()]).optional(),
  notes: z.union([z.string().trim().max(500), z.null()]).optional(),
  active: z.boolean().optional(),
}).refine(value => Object.entries(value).some(([key, field]) => key !== "customerId" && field !== undefined), { message: "Informe ao menos um campo para atualizar." });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageCustomers) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

// Cadastro de clientes (ADR 0047): escopo organização, não por unidade — cada linha soma
// pedidos/gasto de TODAS as unidades da rede (ao contrário do modo local, que soma só a unidade
// ativa — simplificação registrada no ADR).
export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const search = new URL(request.url).searchParams.get("search")?.trim() || undefined;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCustomers) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const customers = listLocalCustomers(session.organization.id, search).map(customer => ({ ...customer, ...getLocalCustomerOrderStats(session.establishment.id, customer.phone) }));
    return Response.json({ customers });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const searchDigits = search ? search.replace(/\D/g, "") : "";
  const customers = await db.customer.findMany({
    where: { organizationId: actor.organization.id, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, ...(searchDigits ? [{ phone: { contains: searchDigits } }] : [])] } : {}) },
    orderBy: { name: "asc" },
    include: { deliveryOrders: { select: { status: true, address: true, createdAt: true, sale: { select: { total: true } } } } },
  });
  return Response.json({
    customers: customers.map(customer => {
      const activeOrders = customer.deliveryOrders.filter(order => order.status !== "CANCELLED");
      const lastOrder = customer.deliveryOrders.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return {
        id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, document: customer.document, notes: customer.notes, active: customer.active, createdAt: customer.createdAt.toISOString(),
        ordersCount: activeOrders.length,
        totalSpent: activeOrders.reduce((sum, order) => sum + (order.sale ? Number(order.sale.total) : 0), 0),
        lastAddress: lastOrder?.address ?? null,
      };
    }),
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCustomers) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalCustomer(session.organization.id, parsed.data);
    if (created === "DUPLICATE_PHONE") return Response.json({ error: "Já existe um cliente com esse telefone." }, { status: 409 });
    return Response.json({ customer: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const customer = await db.customer.create({ data: { organizationId: actor.organization.id, name: parsed.data.name, phone: parsed.data.phone.replace(/\D/g, ""), email: parsed.data.email, document: parsed.data.document, notes: parsed.data.notes } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "Customer", entityId: customer.id, reason: `Cliente "${customer.name}" cadastrado` } });
    return Response.json({ customer }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um cliente com esse telefone." }, { status: 409 });
    return Response.json({ error: "Não foi possível cadastrar o cliente." }, { status: 500 });
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
    if (!session.canManageCustomers) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const { customerId, ...changes } = data;
    const updated = updateLocalCustomer(session.organization.id, customerId, changes);
    if (updated === "NOT_FOUND") return Response.json({ error: "Cliente não encontrado." }, { status: 404 });
    if (updated === "DUPLICATE_PHONE") return Response.json({ error: "Já existe um cliente com esse telefone." }, { status: 409 });
    return Response.json({ customer: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.customer.findFirst({ where: { id: data.customerId, organizationId: actor.organization.id } });
  if (!current) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });

  try {
    const customer = await db.customer.update({ where: { id: current.id }, data: { name: data.name, phone: data.phone?.replace(/\D/g, ""), email: data.email, document: data.document, notes: data.notes, active: data.active } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "Customer", entityId: customer.id, reason: `Cliente "${customer.name}" atualizado` } });
    return Response.json({ customer });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um cliente com esse telefone." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar o cliente." }, { status: 500 });
  }
}
