import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalSupplier, listLocalSuppliers, updateLocalSupplier } from "@/lib/local-finance";

// Documento (CPF/CNPJ) é opcional. Quando informado, aceitamos com ou sem máscara e exigimos
// apenas que, ao remover a máscara, sobrem 11 dígitos (CPF) ou 14 dígitos (CNPJ) — sem validar
// dígito verificador nesta fase (decisão registrada no ADR 0017, sujeita a revisão futura).
const documentSchema = z.string().trim().max(30).optional().refine(value => {
  if (!value) return true;
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14;
}, { message: "Documento deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos), com ou sem máscara." });

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  tradeName: z.string().trim().max(120).optional(),
  document: documentSchema,
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});
const updateSchema = z.object({
  supplierId: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  tradeName: z.string().trim().max(120).nullable().optional(),
  document: z.union([documentSchema, z.null()]).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.union([z.string().trim().email().max(120), z.null()]).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
}).refine(value => Object.entries(value).some(([key, field]) => key !== "supplierId" && field !== undefined), { message: "Informe ao menos um campo para atualizar." });

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
    return Response.json({ suppliers: listLocalSuppliers(session.organization.id) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const suppliers = await db.supplier.findMany({ where: { organizationId: actor.organization.id }, orderBy: { name: "asc" } });
  return Response.json({ suppliers });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalSupplier(session.organization.id, parsed.data);
    if (created === "DUPLICATE") return Response.json({ error: "Já existe um fornecedor com esse nome." }, { status: 409 });
    return Response.json({ supplier: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const supplier = await db.supplier.create({ data: { organizationId: actor.organization.id, name: parsed.data.name, tradeName: parsed.data.tradeName, document: parsed.data.document, phone: parsed.data.phone, email: parsed.data.email, notes: parsed.data.notes } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "Supplier", entityId: supplier.id, reason: `Fornecedor "${supplier.name}" criado` } });
    return Response.json({ supplier }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um fornecedor com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar o fornecedor." }, { status: 500 });
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
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const { supplierId, ...changes } = data;
    const updated = updateLocalSupplier(session.organization.id, supplierId, changes);
    if (updated === "NOT_FOUND") return Response.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe um fornecedor com esse nome." }, { status: 409 });
    return Response.json({ supplier: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.supplier.findFirst({ where: { id: data.supplierId, organizationId: actor.organization.id } });
  if (!current) return Response.json({ error: "Fornecedor não encontrado." }, { status: 404 });

  try {
    const supplier = await db.supplier.update({ where: { id: current.id }, data: { name: data.name, tradeName: data.tradeName, document: data.document, phone: data.phone, email: data.email, notes: data.notes, active: data.active } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "Supplier", entityId: supplier.id, reason: `Fornecedor "${supplier.name}" atualizado` } });
    return Response.json({ supplier });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um fornecedor com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar o fornecedor." }, { status: 500 });
  }
}
