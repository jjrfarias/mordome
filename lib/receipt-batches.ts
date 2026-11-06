import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { businessDay, cents, decimal } from "@/lib/finance-ledger";

type Scope = { organizationId: string; establishmentId: string; actorId: string };
type Tx = Prisma.TransactionClient;
export type ReceiptInput = { idempotencyKey: string; entries: { id: string; updatedAt: string }[]; bankAccountId: string; receivedDate: string; receivedAmount: string; reason?: string };
export class ReceiptError extends Error {}
const fail = (message: string): never => { throw new ReceiptError(message); };
const scopeWhere = (scope: Scope) => ({ organizationId: scope.organizationId, establishmentId: scope.establishmentId });

// Sale -> entry is also the cancellation lock order. Never wait for a sale
// after acquiring its entry, otherwise a concurrent cancellation can deadlock.
async function lockEntries(tx: Tx, scope: Scope, ids: string[]) {
  const where = { ...scopeWhere(scope), id: { in: ids } };
  const origins = await tx.financialEntry.findMany({ where, select: { sourcePayment: { select: { saleId: true } } } });
  const sales = [...new Set(origins.flatMap(e => e.sourcePayment ? [e.sourcePayment.saleId] : []))].sort();
  if (sales.length) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Sale" WHERE "id" IN (${Prisma.join(sales)}) AND "organizationId" = ${scope.organizationId} AND "establishmentId" = ${scope.establishmentId} ORDER BY "id" FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "FinancialEntry" WHERE "id" IN (${Prisma.join(ids)}) AND "organizationId" = ${scope.organizationId} AND "establishmentId" = ${scope.establishmentId} ORDER BY "id" FOR UPDATE`);
  return tx.financialEntry.findMany({ where, include: { category: true, sourcePayment: { select: { sale: { select: { status: true } } } } } });
}
async function audit(tx: Tx, scope: Scope, entityId: string, reason: string) {
  await tx.auditEvent.create({ data: { ...scope, action: "UPDATE", entityType: "ReceiptBatch", entityId, reason } });
}

export async function createReceiptBatch(scope: Scope, input: ReceiptInput) {
  const rows = [...input.entries].sort((a, b) => a.id.localeCompare(b.id));
  const ids = rows.map(e => e.id);
  if (new Set(ids).size !== ids.length) fail("Há recebimentos repetidos na seleção.");
  const received = cents(input.receivedAmount);
  if (received < 0 || received > 999999999999 || input.receivedDate > businessDay()) fail("Valor ou data de recebimento inválidos.");
  const fingerprint = createHash("sha256").update(JSON.stringify({ rows, bank: input.bankAccountId, date: input.receivedDate, received, reason: input.reason?.trim() ?? "" })).digest("hex");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
    const prior = await tx.receiptBatch.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (prior) {
      if (prior.organizationId !== scope.organizationId || prior.establishmentId !== scope.establishmentId || prior.requestFingerprint !== fingerprint) fail("Esta confirmação já foi utilizada. Atualize a tela.");
      return prior;
    }
    // A shared account lock serializes against deactivation without blocking other receipts.
    await tx.$queryRaw`SELECT "id" FROM "BankAccount" WHERE "id" = ${input.bankAccountId} AND "establishmentId" = ${scope.establishmentId} FOR SHARE`;
    const account = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, establishmentId: scope.establishmentId, active: true, establishment: { organizationId: scope.organizationId } } });
    if (!account) fail("Selecione uma conta ativa desta unidade.");
    const entries = await lockEntries(tx, scope, ids);
    if (entries.length !== ids.length) fail("Um recebimento não está disponível nesta unidade. Atualize a tela.");
    for (const entry of entries) {
      if (entry.updatedAt.toISOString() !== rows.find(e => e.id === entry.id)!.updatedAt) fail("Um recebimento foi alterado. Atualize a tela antes de confirmar.");
      if (entry.category.kind !== "INCOME" || entry.voidedAt || entry.reconciled || entry.receiptBatchId || entry.isReceiptBatchAdjustment || entry.reversalOfId || entry.sourcePayment?.sale.status === "CANCELLED") fail("A seleção contém um recebimento indisponível para conciliação.");
      if (entry.bankAccountId && entry.bankAccountId !== account!.id) fail("Todos os recebimentos do lote devem pertencer à mesma conta.");
    }
    const expected = entries.reduce((total, e) => total + cents(e.amount), 0);
    if (expected < 0 || expected > 999999999999) fail("O total do lote excede o limite permitido.");
    const difference = received - expected;
    if (difference !== 0 && !input.reason?.trim()) fail("Informe o motivo da diferença entre previsto e recebido.");
    const paidAt = new Date(`${input.receivedDate}T15:00:00Z`);
    const batch = await tx.receiptBatch.create({ data: {
      ...scopeWhere(scope), bankAccountId: account!.id, idempotencyKey: input.idempotencyKey, requestFingerprint: fingerprint,
      expectedAmount: decimal(expected), receivedAmount: decimal(received), differenceAmount: decimal(difference),
      receivedDate: new Date(input.receivedDate), reason: input.reason?.trim() || null, createdById: scope.actorId,
    } });
    await tx.receiptBatchItem.createMany({ data: entries.map(e => ({ ...scopeWhere(scope), batchId: batch.id, entryId: e.id, description: e.description, expectedAmount: e.amount, previousStatus: e.status, previousPaidAt: e.paidAt, previousBankAccountId: e.bankAccountId })) });
    const settlement = { bankAccountId: account!.id, status: "PAID" as const, paidAt, reconciled: true, reconciledAt: new Date(), reconciledById: scope.actorId, receiptBatchId: batch.id };
    await tx.financialEntry.updateMany({ where: { ...scopeWhere(scope), id: { in: ids } }, data: settlement });
    if (difference !== 0) {
      const kind = difference > 0 ? "INCOME" : "EXPENSE";
      const category = await tx.financialCategory.upsert({ where: { organizationId_name_kind: { organizationId: scope.organizationId, name: "Ajustes de recebimentos", kind } }, create: { organizationId: scope.organizationId, name: "Ajustes de recebimentos", kind }, update: {} });
      await tx.financialEntry.create({ data: { ...scopeWhere(scope), ...settlement, categoryId: category.id, createdById: scope.actorId, description: `Diferença de recebimento · lote ${batch.id.slice(-8)}`, amount: decimal(Math.abs(difference)), dueDate: new Date(input.receivedDate), isReceiptBatchAdjustment: true, notes: input.reason!.trim() } });
    }
    await audit(tx, scope, batch.id, `Conciliação manual de ${entries.length} recebimento(s); previsto ${decimal(expected)}, recebido ${decimal(received)}, diferença ${decimal(difference)}. ${input.reason?.trim() ?? ""}`);
    return batch;
  }, { timeout: 20000 });
}

export async function reverseReceiptBatch(scope: Scope, batchId: string, reason: string) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ReceiptBatch" WHERE "id" = ${batchId} AND "organizationId" = ${scope.organizationId} AND "establishmentId" = ${scope.establishmentId} FOR UPDATE`;
    const batch = await tx.receiptBatch.findFirst({ where: { ...scopeWhere(scope), id: batchId }, include: { items: true } });
    if (!batch) return fail("Lote não encontrado nesta unidade.");
    if (batch.status === "REVERSED") return batch;
    const ids = batch.items.map(i => i.entryId).sort();
    const entries = await lockEntries(tx, scope, ids);
    if (entries.length !== ids.length || entries.some(e => e.receiptBatchId !== batch.id || e.voidedAt || e.sourcePayment?.sale.status === "CANCELLED") || await tx.financialEntry.count({ where: { ...scopeWhere(scope), reversalOfId: { in: ids } } })) fail("O lote tem recebimento cancelado ou alterado. Confira os estornos antes de ajustar o financeiro.");
    for (const item of batch.items) await tx.financialEntry.update({ where: { id: item.entryId }, data: { status: item.previousStatus, paidAt: item.previousPaidAt, bankAccountId: item.previousBankAccountId, receiptBatchId: null, reconciled: false, reconciledAt: null, reconciledById: null } });
    await tx.financialEntry.updateMany({ where: { ...scopeWhere(scope), receiptBatchId: batch.id, isReceiptBatchAdjustment: true }, data: { voidedAt: new Date() } });
    const result = await tx.receiptBatch.update({ where: { id: batch.id }, data: { status: "REVERSED", reversedAt: new Date(), reversedById: scope.actorId, reversalReason: reason.trim() } });
    await audit(tx, scope, batch.id, `Conciliação e baixas do lote desfeitas: ${reason.trim()}`);
    return result;
  }, { timeout: 20000 });
}
