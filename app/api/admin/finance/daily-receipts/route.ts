import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { isLocalAuthEnabled } from "@/lib/local-auth";
import { db } from "@/lib/db";
import { addDays, businessDay, cents, validDay } from "@/lib/finance-ledger";
import { createReceiptBatch, ReceiptError, reverseReceiptBatch } from "@/lib/receipt-batches";

const day = z.string().refine(validDay, "Data inválida.");
const createSchema = z.object({
  idempotencyKey: z.string().uuid(),
  entries: z.array(z.object({ id: z.string().min(1), updatedAt: z.string().datetime() })).min(1).max(200),
  bankAccountId: z.string().min(1), receivedDate: day,
  receivedAmount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/), reason: z.string().trim().max(1000).optional(),
});
const reverseSchema = z.object({ batchId: z.string().min(1), reason: z.string().trim().min(3).max(1000) });
async function actor(request: Request) {
  if (!isSameOrigin(request) || isLocalAuthEnabled()) return null;
  const session = await getCurrentSession();
  if (!session?.canManageFinanceEntries) return null;
  const member = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return member ? { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id } : null;
}
export async function GET(request: Request) {
  const scope = await actor(request);
  if (!scope) return Response.json({ error: "Acesso negado. Esta operação exige uma sessão da unidade no banco de dados." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? businessDay();
  if (!validDay(date)) return Response.json({ error: "Data inválida." }, { status: 400 });
  const bankAccountId = params.get("bankAccountId") || undefined;
  const overdue = params.get("overdue") !== "false";
  const where = { organizationId: scope.organizationId, establishmentId: scope.establishmentId };
  const start = new Date(`${date}T03:00:00Z`), end = new Date(`${addDays(date, 1)}T03:00:00Z`);
  const result = await db.$transaction(async tx => {
    const bankAccounts = await tx.bankAccount.findMany({ where: { establishmentId: scope.establishmentId }, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } });
    const filter: Prisma.FinancialEntryWhereInput = {
      ...where, bankAccountId, voidedAt: null, isReceiptBatchAdjustment: false, category: { kind: "INCOME" },
      OR: [{ status: "PENDING", NOT: { sourcePayment: { sale: { status: "CANCELLED" } } }, dueDate: { gte: overdue ? undefined : new Date(date), lt: new Date(addDays(date, 1)) } }, { status: "PAID", paidAt: { gte: start, lt: end } }],
    };
    const entries = await tx.financialEntry.findMany({ where: filter, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 1000,
      select: { id: true, description: true, amount: true, grossAmount: true, feeAmount: true, sourceLabel: true, dueDate: true, paidAt: true, status: true, bankAccountId: true, reconciled: true, receiptBatchId: true, updatedAt: true, sourcePayment: { select: { sale: { select: { status: true } } } } } });
    const [total, pending, paid, adjustments, batches] = await Promise.all([
      tx.financialEntry.count({ where: filter }),
      tx.financialEntry.aggregate({ where: { ...filter, status: "PENDING" }, _sum: { amount: true } }),
      tx.financialEntry.aggregate({ where: { ...filter, status: "PAID" }, _sum: { amount: true } }),
      tx.receiptBatch.aggregate({ where: { ...where, bankAccountId, receivedDate: new Date(date), status: "ACTIVE" }, _sum: { differenceAmount: true } }),
      tx.receiptBatch.findMany({ where: { ...where, bankAccountId, receivedDate: new Date(date) }, include: { items: { select: { entryId: true, description: true, expectedAmount: true } }, createdBy: { select: { name: true } }, reversedBy: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 }),
    ]);
    const difference = cents(adjustments._sum.differenceAmount ?? 0);
    return { entries, total, bankAccounts, batches, date, pendingCents: cents(pending._sum.amount ?? 0), receivedCents: cents(paid._sum.amount ?? 0) + difference, differenceCents: difference };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
async function write(request: Request, reverse: boolean) {
  const scope = await actor(request);
  if (!scope) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    if (reverse) {
      const parsed = reverseSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "Informe o lote e uma justificativa com pelo menos 3 caracteres." }, { status: 400 });
      return Response.json({ batch: await reverseReceiptBatch(scope, parsed.data.batchId, parsed.data.reason) });
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Confira os recebimentos, a conta, a data e o valor informado (até 200 itens)." }, { status: 400 });
    return Response.json({ batch: await createReceiptBatch(scope, parsed.data) });
  } catch (error) {
    if (error instanceof ReceiptError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2028"].includes(error.code)) return Response.json({ error: "Houve uma alteração simultânea. Atualize a tela e tente novamente." }, { status: 409 });
    console.error("daily_receipts_failed", error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Não foi possível concluir o lote. Nenhum recebimento foi alterado." }, { status: 500 });
  }
}
export const POST = (request: Request) => write(request, false);
export const PATCH = (request: Request) => write(request, true);
