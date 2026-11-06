import { financeDaySchema, financeMoneySchema } from "@/lib/finance-validation";
import { businessDay } from "@/lib/finance-ledger";
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
  initialBalance: financeMoneySchema.optional(),
  balanceAsOf: financeDaySchema.refine(value => value <= businessDay(), "A data do saldo não pode estar no futuro.").optional(),
}).refine(value => (value.balanceAsOf === undefined) === (value.initialBalance === undefined), { message: "Informe juntos o saldo inicial e sua data." });
const updateSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  bank: z.string().trim().min(2).max(60).optional(),
  agency: z.string().trim().max(20).nullable().optional(),
  accountNumber: z.string().trim().max(30).nullable().optional(),
  initialBalance: financeMoneySchema.optional(),
  balanceAsOf: financeDaySchema.refine(value => value <= businessDay(), "A data do saldo não pode estar no futuro.").optional(),
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
    const created = createLocalBankAccount(session.establishment.id, { ...parsed.data, initialBalance: parsed.data.initialBalance === undefined ? undefined : Number(parsed.data.initialBalance) });
    if (created === "DUPLICATE") return Response.json({ error: "Já existe uma conta com esse nome." }, { status: 409 });
    return Response.json({ account: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const account = await db.$transaction(async tx => {
    const account = await tx.bankAccount.create({ data: { establishmentId: actor.establishment.id, name: parsed.data.name, bank: parsed.data.bank, agency: parsed.data.agency, accountNumber: parsed.data.accountNumber, balanceAsOf: parsed.data.balanceAsOf ? new Date(parsed.data.balanceAsOf) : undefined, initialBalance: parsed.data.initialBalance ?? "0" } });
    await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "BankAccount", entityId: account.id, reason: `Conta bancária "${account.name}" criada` } });
    return account;
    });
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
  if ((data.balanceAsOf === undefined) !== (data.initialBalance === undefined)) return Response.json({ error: "Informe juntos o saldo inicial e sua data de referência." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const { accountId, ...changes } = data;
    const updated = updateLocalBankAccount(session.establishment.id, accountId, { ...changes, initialBalance: changes.initialBalance === undefined ? undefined : Number(changes.initialBalance) });
    if (updated === "NOT_FOUND") return Response.json({ error: "Conta não encontrada." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe uma conta com esse nome." }, { status: 409 });
    return Response.json({ account: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.bankAccount.findFirst({ where: { id: data.accountId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Conta não encontrada." }, { status: 404 });

  try {
    const account = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "BankAccount" WHERE "id" = ${current.id} FOR UPDATE`;
    const before = await tx.bankAccount.findUniqueOrThrow({ where: { id: current.id } });
    const account = await tx.bankAccount.update({ where: { id: current.id }, data: { name: data.name, bank: data.bank, agency: data.agency, accountNumber: data.accountNumber, balanceAsOf: data.balanceAsOf ? new Date(data.balanceAsOf) : undefined, initialBalance: data.initialBalance, active: data.active } });
    await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "BankAccount", entityId: account.id, reason: `Conta bancária "${account.name}" atualizada`, before: { initialBalance: before.initialBalance.toString(), balanceAsOf: before.balanceAsOf?.toISOString() ?? null }, after: { initialBalance: account.initialBalance.toString(), balanceAsOf: account.balanceAsOf?.toISOString() ?? null } } });
    return account;
    });
    return Response.json({ account });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma conta com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar a conta." }, { status: 500 });
  }
}
