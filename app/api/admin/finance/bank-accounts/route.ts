import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalBankAccount, listLocalBankAccounts, updateLocalBankAccount } from "@/lib/local-finance";

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  bank: z.string().trim().min(2).max(60),
  agency: z.string().trim().max(20).optional(),
  accountNumber: z.string().trim().max(30).optional(),
  initialBalance: z.number().finite().optional(),
});
const updateSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  bank: z.string().trim().min(2).max(60).optional(),
  agency: z.string().trim().max(20).nullable().optional(),
  accountNumber: z.string().trim().max(30).nullable().optional(),
  initialBalance: z.number().finite().optional(),
  active: z.boolean().optional(),
}).refine(value => Object.values(value).some(field => field !== undefined) , { message: "Informe ao menos um campo para atualizar." });

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
    return Response.json({ accounts: listLocalBankAccounts(session.establishment.id) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const accounts = await db.bankAccount.findMany({ where: { establishmentId: actor.establishment.id }, orderBy: { name: "asc" } });
  return Response.json({ accounts });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalBankAccount(session.establishment.id, parsed.data);
    if (created === "DUPLICATE") return Response.json({ error: "Já existe uma conta com esse nome." }, { status: 409 });
    return Response.json({ account: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const account = await db.bankAccount.create({ data: { establishmentId: actor.establishment.id, name: parsed.data.name, bank: parsed.data.bank, agency: parsed.data.agency, accountNumber: parsed.data.accountNumber, initialBalance: parsed.data.initialBalance ?? 0 } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "BankAccount", entityId: account.id, reason: `Conta bancária "${account.name}" criada` } });
    return Response.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma conta com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar a conta." }, { status: 500 });
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
    const updated = updateLocalBankAccount(session.establishment.id, data.accountId, data);
    if (updated === "NOT_FOUND") return Response.json({ error: "Conta não encontrada." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe uma conta com esse nome." }, { status: 409 });
    return Response.json({ account: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.bankAccount.findFirst({ where: { id: data.accountId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Conta não encontrada." }, { status: 404 });

  try {
    const account = await db.bankAccount.update({ where: { id: current.id }, data: { name: data.name, bank: data.bank, agency: data.agency, accountNumber: data.accountNumber, initialBalance: data.initialBalance, active: data.active } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "BankAccount", entityId: account.id, reason: `Conta bancária "${account.name}" atualizada` } });
    return Response.json({ account });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma conta com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar a conta." }, { status: 500 });
  }
}
