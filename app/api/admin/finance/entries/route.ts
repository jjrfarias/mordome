import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalFinancialCategories, listLocalBankAccounts, listLocalPaymentMethods, listLocalFinancialEntries, createLocalFinancialEntry, updateLocalFinancialEntry } from "@/lib/local-finance";

const createSchema = z.object({
  categoryId: z.string().min(1),
  bankAccountId: z.string().min(1).optional(),
  paymentMethodId: z.string().min(1).optional(),
  description: z.string().trim().min(2).max(200),
  amount: z.number().positive(),
  dueDate: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});
const updateSchema = z.object({
  entryId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  bankAccountId: z.string().min(1).nullable().optional(),
  paymentMethodId: z.string().min(1).nullable().optional(),
  description: z.string().trim().min(2).max(200).optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().min(1).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["PENDING", "PAID"]).optional(),
}).refine(value => Object.entries(value).some(([key, field]) => key !== "entryId" && field !== undefined), { message: "Informe ao menos um campo para atualizar." });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageFinanceEntries) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const statusFilter = status === "PENDING" || status === "PAID" ? status : undefined;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinanceEntries) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({
      entries: listLocalFinancialEntries(session.establishment.id, { status: statusFilter, from, to }),
      categories: listLocalFinancialCategories(session.organization.id).filter(item => item.active),
      bankAccounts: listLocalBankAccounts(session.establishment.id).filter(item => item.active),
      paymentMethods: listLocalPaymentMethods(session.establishment.id).filter(item => item.active),
    });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const [entries, categories, bankAccounts, paymentMethods] = await Promise.all([
    db.financialEntry.findMany({
      where: {
        establishmentId: actor.establishment.id,
        status: statusFilter,
        dueDate: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
      },
      orderBy: { dueDate: "asc" },
    }),
    db.financialCategory.findMany({ where: { organizationId: actor.organization.id, active: true }, orderBy: { name: "asc" } }),
    db.bankAccount.findMany({ where: { establishmentId: actor.establishment.id, active: true }, orderBy: { name: "asc" } }),
    db.paymentMethodConfig.findMany({ where: { establishmentId: actor.establishment.id, active: true }, orderBy: { name: "asc" } }),
  ]);
  return Response.json({ entries, categories, bankAccounts, paymentMethods });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinanceEntries) return Response.json({ error: "Acesso negado." }, { status: 403 });
    if (!listLocalFinancialCategories(session.organization.id).some(category => category.id === data.categoryId)) return Response.json({ error: "Categoria inválida." }, { status: 400 });
    const entry = createLocalFinancialEntry(session.organization.id, session.establishment.id, session.user.id, data);
    return Response.json({ entry }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const category = await db.financialCategory.findFirst({ where: { id: data.categoryId, organizationId: actor.organization.id } });
  if (!category) return Response.json({ error: "Categoria inválida." }, { status: 400 });
  if (data.bankAccountId) {
    const account = await db.bankAccount.findFirst({ where: { id: data.bankAccountId, establishmentId: actor.establishment.id } });
    if (!account) return Response.json({ error: "Conta bancária inválida." }, { status: 400 });
  }
  if (data.paymentMethodId) {
    const method = await db.paymentMethodConfig.findFirst({ where: { id: data.paymentMethodId, establishmentId: actor.establishment.id } });
    if (!method) return Response.json({ error: "Forma de pagamento inválida." }, { status: 400 });
  }
  try {
    const entry = await db.financialEntry.create({
      data: {
        organizationId: actor.organization.id, establishmentId: actor.establishment.id, categoryId: data.categoryId,
        bankAccountId: data.bankAccountId, paymentMethodId: data.paymentMethodId, description: data.description,
        amount: data.amount, dueDate: new Date(data.dueDate), notes: data.notes, createdById: actor.user.id,
      },
    });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "FinancialEntry", entityId: entry.id, reason: `Lançamento "${entry.description}" criado` } });
    return Response.json({ entry }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível criar o lançamento." }, { status: 500 });
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
    if (!session.canManageFinanceEntries) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const { entryId, ...changes } = data;
    const updated = updateLocalFinancialEntry(session.establishment.id, entryId, changes);
    if (updated === "NOT_FOUND") return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
    return Response.json({ entry: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.financialEntry.findFirst({ where: { id: data.entryId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });

  if (data.categoryId) {
    const category = await db.financialCategory.findFirst({ where: { id: data.categoryId, organizationId: actor.organization.id } });
    if (!category) return Response.json({ error: "Categoria inválida." }, { status: 400 });
  }

  try {
    const entry = await db.financialEntry.update({
      where: { id: current.id },
      data: {
        categoryId: data.categoryId, bankAccountId: data.bankAccountId, paymentMethodId: data.paymentMethodId,
        description: data.description, amount: data.amount, dueDate: data.dueDate ? new Date(data.dueDate) : undefined, notes: data.notes,
        status: data.status, paidAt: data.status === "PAID" ? (current.paidAt ?? new Date()) : data.status === "PENDING" ? null : undefined,
      },
    });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "FinancialEntry", entityId: entry.id, reason: data.status ? `Lançamento "${entry.description}" marcado como ${data.status === "PAID" ? "pago" : "pendente"}` : `Lançamento "${entry.description}" atualizado` } });
    return Response.json({ entry });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return Response.json({ error: "Não foi possível atualizar o lançamento." }, { status: 400 });
    return Response.json({ error: "Não foi possível atualizar o lançamento." }, { status: 500 });
  }
}
