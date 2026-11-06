import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { cents } from "@/lib/finance-ledger";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalBankAccounts, listLocalFinancialEntries, listLocalFinancialEntriesForReconciliation, reconcileLocalFinancialEntry } from "@/lib/local-finance";

const patchSchema = z.object({
  entryId: z.string().min(1).optional(),
  entryIds: z.array(z.string().min(1)).min(1).optional(),
  reconciled: z.boolean(),
}).refine(value => Boolean(value.entryId) !== Boolean(value.entryIds), { message: "Informe entryId ou entryIds, não os dois." });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageFinanceEntries) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

function totals(entries: { amount: number | Prisma.Decimal; reconciled: boolean }[]) {
  let launched = 0;
  let reconciled = 0;
  for (const entry of entries) {
    const amount = cents(entry.amount);
    launched += amount;
    if (entry.reconciled) reconciled += amount;
  }
  return { launched: launched / 100, reconciled: reconciled / 100, pending: (launched - reconciled) / 100 };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const url = new URL(request.url);
  const bankAccountId = url.searchParams.get("bankAccountId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!bankAccountId || !from || !to) return Response.json({ error: "Informe conta bancária e período." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinanceEntries) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const bankAccounts = listLocalBankAccounts(session.establishment.id);
    if (!bankAccounts.some(account => account.id === bankAccountId)) return Response.json({ error: "Conta bancária inválida." }, { status: 400 });
    const entries = listLocalFinancialEntriesForReconciliation(session.establishment.id, bankAccountId, from, to);
    return Response.json({ entries, bankAccounts, ...totals(entries) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const account = await db.bankAccount.findFirst({ where: { id: bankAccountId, establishmentId: actor.establishment.id } });
  if (!account) return Response.json({ error: "Conta bancária inválida." }, { status: 400 });
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setUTCHours(23, 59, 59, 999);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) return Response.json({ error: "Período inválido." }, { status: 400 });

  const [entries, bankAccounts] = await Promise.all([
    db.financialEntry.findMany({
      where: { establishmentId: actor.establishment.id, bankAccountId, status: "PAID", voidedAt: null, paidAt: { gte: fromDate, lte: toDate } },
      orderBy: { paidAt: "asc" },
    }),
    db.bankAccount.findMany({ where: { establishmentId: actor.establishment.id, active: true }, orderBy: { name: "asc" } }),
  ]);
  return Response.json({ entries, bankAccounts, ...totals(entries) });
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;
  const ids = [...new Set(data.entryIds ?? [data.entryId!])].sort();

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinanceEntries) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const current = listLocalFinancialEntries(session.establishment.id).filter(e => ids.includes(e.id));
    if (current.length !== ids.length) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
    if (data.reconciled && current.some(e => e.status !== "PAID" || !e.paidAt || !e.bankAccountId)) return Response.json({ error: "Somente baixas com conta e data efetiva podem ser conciliadas." }, { status: 409 });
    const updated = [];
    for (const entryId of ids) {
      const result = reconcileLocalFinancialEntry(session.establishment.id, entryId, data.reconciled, session.user.id);
      if (result === "NOT_FOUND") return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
      updated.push(result);
    }
    return Response.json({ entries: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const updated = await db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "FinancialEntry" WHERE "id" IN (${Prisma.join(ids)}) AND "establishmentId" = ${actor.establishment.id} AND "organizationId" = ${actor.organization.id} ORDER BY "id" FOR UPDATE`);
    const current = await tx.financialEntry.findMany({ where: { id: { in: ids }, establishmentId: actor.establishment.id, organizationId: actor.organization.id } });
    if (current.length !== ids.length) throw new Error("Lançamento não encontrado.");
    if (data.reconciled && current.some(e => e.status !== "PAID" || !e.paidAt || !e.bankAccountId)) throw new Error("Somente baixas com conta e data efetiva podem ser conciliadas.");
    if (current.some(e => e.receiptBatchId)) throw new Error("Este recebimento pertence a um lote. Gerencie o lote em Recebimentos do dia.");
    if (current.some(e => e.voidedAt)) throw new Error("Somente baixas com conta e data efetiva podem ser conciliadas.");
    const result = await Promise.all(current.map(entry => tx.financialEntry.update({
      where: { id: entry.id },
      data: {
        reconciled: data.reconciled,
        reconciledAt: data.reconciled ? new Date() : null,
        reconciledById: data.reconciled ? actor.user.id : null,
      },
    })));
    await tx.auditEvent.createMany({
      data: current.map(entry => ({
        organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE" as const,
        entityType: "FinancialEntry", entityId: entry.id,
        reason: `Lançamento "${entry.description}" marcado como ${data.reconciled ? "conciliado" : "não conciliado"}`,
      })),
    });
    return result;
    });
    return Response.json({ entries: updated });
  } catch (error) {
    if (error instanceof Error && ["Este recebimento pertence a um lote. Gerencie o lote em Recebimentos do dia.", "Lançamento não encontrado.", "Somente baixas com conta e data efetiva podem ser conciliadas."].includes(error.message)) return Response.json({ error: error.message }, { status: error.message === "Lançamento não encontrado." ? 404 : 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError) return Response.json({ error: "Não foi possível atualizar a conciliação." }, { status: 400 });
    return Response.json({ error: "Não foi possível atualizar a conciliação." }, { status: 500 });
  }
}
