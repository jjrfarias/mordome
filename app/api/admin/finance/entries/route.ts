import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createFinanceEntrySchema, updateFinanceEntrySchema } from "@/lib/finance-validation";
import { businessDay, validDay } from "@/lib/finance-ledger";
import { recordLocalAudit } from "@/lib/local-audit";
import { listLocalFinancialCategories, listLocalBankAccounts, listLocalPaymentMethods, listLocalSuppliers, listLocalFinancialEntries, createLocalFinancialEntry, updateLocalFinancialEntry } from "@/lib/local-finance";

async function actor() {
  const local = isLocalAuthEnabled();
  const session = local ? await getLocalSession() : await getCurrentSession();
  return session?.canManageFinanceEntries ? { session, local } : null;
}
const fail = (error: string, status = 400) => Response.json({ error }, { status });
type References = { categoryId?: string; bankAccountId?: string | null; paymentMethodId?: string | null; supplierId?: string | null };
async function references(tx: Prisma.TransactionClient, organizationId: string, establishmentId: string, data: References) {
  if (data.categoryId) await tx.$queryRaw`SELECT "id" FROM "FinancialCategory" WHERE "id" = ${data.categoryId} AND "organizationId" = ${organizationId} FOR SHARE`;
  if (data.categoryId && !await tx.financialCategory.count({ where: { id: data.categoryId, organizationId, active: true } })) throw new Error("Categoria inválida.");
  if (data.bankAccountId && !await tx.bankAccount.count({ where: { id: data.bankAccountId, establishmentId, establishment: { organizationId }, active: true } })) throw new Error("Conta inválida.");
  if (data.paymentMethodId && !await tx.paymentMethodConfig.count({ where: { id: data.paymentMethodId, establishmentId, establishment: { organizationId }, active: true } })) throw new Error("Forma de pagamento inválida.");
  if (data.supplierId && !await tx.supplier.count({ where: { id: data.supplierId, organizationId, active: true } })) throw new Error("Fornecedor inválido.");
}
function localReferences(org: string, unit: string, data: References) {
  return (!data.categoryId || listLocalFinancialCategories(org).some(c => c.id === data.categoryId && c.active)) &&
    (!data.bankAccountId || listLocalBankAccounts(unit).some(a => a.id === data.bankAccountId && a.active)) &&
    (!data.paymentMethodId || listLocalPaymentMethods(unit).some(m => m.id === data.paymentMethodId && m.active)) &&
    (!data.supplierId || listLocalSuppliers(org).some(s => s.id === data.supplierId && s.active));
}
function safeError(error: unknown) {
  const allowed = ["Categoria inválida.", "Conta inválida.", "Forma de pagamento inválida.", "Fornecedor inválido.", "Lançamento não encontrado.", "Informe a conta e a data efetiva da baixa.", "Desfaça a conciliação antes de alterar este lançamento.", "A data efetiva não pode estar no futuro.", "Esta solicitação já foi usada com outros dados."];
  if (error instanceof Error && allowed.includes(error.message)) return fail(error.message, error.message === "Lançamento não encontrado." ? 404 : 409);
  return fail("Não foi possível salvar. Atualize os dados antes de tentar novamente.", 409);
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return fail("Origem inválida.", 403);
  const resolved = await actor(); if (!resolved) return fail("Acesso negado.", 403);
  const { session, local } = resolved;
  const params = new URL(request.url).searchParams;
  const status = params.get("status"), from = params.get("from"), to = params.get("to");
  if ((status && !["PAID", "PENDING"].includes(status)) || (from && !validDay(from)) || (to && !validDay(to)) || (from && to && from > to)) return fail("Filtro inválido.");
  const scope = { organizationId: session.organization.id, establishmentId: session.establishment.id };
  if (local) return Response.json({ entries: listLocalFinancialEntries(scope.establishmentId, { status: status as "PAID" | "PENDING" | undefined, from: from ?? undefined, to: to ? `${to}T23:59:59.999Z` : undefined }), categories: listLocalFinancialCategories(scope.organizationId), bankAccounts: listLocalBankAccounts(scope.establishmentId), paymentMethods: listLocalPaymentMethods(scope.establishmentId), suppliers: listLocalSuppliers(scope.organizationId) });
  const [entries, categories, bankAccounts, paymentMethods, suppliers] = await Promise.all([
    db.financialEntry.findMany({ where: { ...scope, status: status as "PAID" | "PENDING" | undefined || undefined, dueDate: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined } : undefined }, orderBy: [{ dueDate: "asc" }, { id: "asc" }] }),
    db.financialCategory.findMany({ where: { organizationId: scope.organizationId }, orderBy: { name: "asc" } }),
    db.bankAccount.findMany({ where: { establishmentId: scope.establishmentId }, orderBy: { name: "asc" } }),
    db.paymentMethodConfig.findMany({ where: { establishmentId: scope.establishmentId }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ where: { organizationId: scope.organizationId }, orderBy: { name: "asc" } }),
  ]);
  return Response.json({ entries, categories, bankAccounts, paymentMethods, suppliers }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Origem inválida.", 403);
  const resolved = await actor(); if (!resolved) return fail("Acesso negado.", 403);
  const parsed = createFinanceEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const { session, local } = resolved, data = parsed.data;
  const scope = { organizationId: session.organization.id, establishmentId: session.establishment.id };
  if (local) {
    if (!localReferences(scope.organizationId, scope.establishmentId, data)) return fail("Categoria, conta, forma de pagamento ou fornecedor inválido.");
    const entry = createLocalFinancialEntry(scope.organizationId, scope.establishmentId, session.user.id, { ...data, amount: Number(data.amount) });
    recordLocalAudit({ ...scope, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "CREATE", entityType: "FinancialEntry", entityId: entry.id, reason: "Lançamento criado" });
    return Response.json({ entry }, { status: 201 });
  }
  try {
    const entry = await db.$transaction(async tx => {
      if (data.idempotencyKey) {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${data.idempotencyKey}, 0))`;
        const existing = await tx.financialEntry.findFirst({ where: { ...scope, idempotencyKey: data.idempotencyKey } });
        if (existing) {
          if (existing.description !== data.description || existing.amount.toFixed(2) !== data.amount || existing.categoryId !== data.categoryId || existing.dueDate.toISOString().slice(0, 10) !== data.dueDate || existing.bankAccountId !== (data.bankAccountId ?? null) || existing.paymentMethodId !== (data.paymentMethodId ?? null) || existing.supplierId !== (data.supplierId ?? null) || existing.notes !== (data.notes ?? null)) throw new Error("Esta solicitação já foi usada com outros dados.");
          return existing;
        }
      }
      await references(tx, scope.organizationId, scope.establishmentId, data);
      const created = await tx.financialEntry.create({ data: { ...data, ...scope, dueDate: new Date(data.dueDate), createdById: session.user.id } });
      await tx.auditEvent.create({ data: { ...scope, actorId: session.user.id, action: "CREATE", entityType: "FinancialEntry", entityId: created.id, reason: `Lançamento "${created.description}" criado`, after: { amount: data.amount, dueDate: data.dueDate, bankAccountId: data.bankAccountId ?? null } } });
      return created;
    });
    return Response.json({ entry }, { status: 201 });
  } catch (error) { return safeError(error); }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return fail("Origem inválida.", 403);
  const resolved = await actor(); if (!resolved) return fail("Acesso negado.", 403);
  const parsed = updateFinanceEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const { session, local } = resolved;
  const { entryId, paidDate, ...data } = parsed.data;
  const scope = { organizationId: session.organization.id, establishmentId: session.establishment.id };
  if (local) {
    const current = listLocalFinancialEntries(scope.establishmentId).find(e => e.id === entryId);
    if (!current) return fail("Lançamento não encontrado.", 404);
    if (current.reconciled) return fail("Desfaça a conciliação antes de alterar este lançamento.", 409);
    if (!localReferences(scope.organizationId, scope.establishmentId, data)) return fail("Categoria, conta, forma de pagamento ou fornecedor inválido.");
    const status = data.status ?? current.status;
    const paidAt = status === "PAID" ? (paidDate ? `${paidDate}T15:00:00.000Z` : current.paidAt) : null;
    if (status === "PAID" && (!(data.bankAccountId === undefined ? current.bankAccountId : data.bankAccountId) || !paidAt)) return fail("Informe a conta e a data efetiva da baixa.");
    const entry = updateLocalFinancialEntry(scope.establishmentId, entryId, { ...data, amount: data.amount === undefined ? undefined : Number(data.amount), paidAt });
    recordLocalAudit({ ...scope, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "UPDATE", entityType: "FinancialEntry", entityId: entryId, reason: "Lançamento atualizado" });
    return Response.json({ entry });
  }
  try {
    const entry = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "FinancialEntry" WHERE "id" = ${entryId} AND "organizationId" = ${scope.organizationId} AND "establishmentId" = ${scope.establishmentId} FOR UPDATE`;
      const current = await tx.financialEntry.findFirst({ where: { id: entryId, ...scope } });
      if (!current) throw new Error("Lançamento não encontrado.");
      if (current.reconciled) throw new Error("Desfaça a conciliação antes de alterar este lançamento.");
      await references(tx, scope.organizationId, scope.establishmentId, data);
      const status = data.status ?? current.status;
      const accountId = data.bankAccountId === undefined ? current.bankAccountId : data.bankAccountId;
      const paidAt = status === "PAID" ? (paidDate ? new Date(`${paidDate}T15:00:00.000Z`) : current.paidAt) : null;
      if (status === "PAID" && (!accountId || !paidAt)) throw new Error("Informe a conta e a data efetiva da baixa.");
      if (paidAt && businessDay(paidAt) > businessDay()) throw new Error("A data efetiva não pode estar no futuro.");
      const updated = await tx.financialEntry.update({ where: { id: current.id }, data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : undefined, paidAt, reconciled: false, reconciledAt: null, reconciledById: null } });
      await tx.auditEvent.create({ data: { ...scope, actorId: session.user.id, action: "UPDATE", entityType: "FinancialEntry", entityId: updated.id, reason: `Lançamento "${updated.description}" atualizado`, before: { status: current.status, amount: current.amount.toString(), bankAccountId: current.bankAccountId, paidAt: current.paidAt?.toISOString() ?? null }, after: { status: updated.status, amount: updated.amount.toString(), bankAccountId: updated.bankAccountId, paidAt: updated.paidAt?.toISOString() ?? null } } });
      return updated;
    });
    return Response.json({ entry });
  } catch (error) { return safeError(error); }
}
