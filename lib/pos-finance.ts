import { Prisma } from "@/generated/prisma/client";
import { businessDay, cents, decimal } from "@/lib/finance-ledger";
import { posMethodLabels, receiptPlan } from "@/lib/pos-receipts";

type Scope = { organizationId: string; establishmentId: string; actorId: string };
type Tx = Prisma.TransactionClient;
const channelLabels = { POS: "PDV", FLOOR: "Salão", DELIVERY: "Delivery", ONLINE: "Online" } as const;
async function category(tx: Tx, organizationId: string, kind: "INCOME" | "EXPENSE", channel: keyof typeof channelLabels) {
  const name = `${kind === "INCOME" ? "Vendas" : "Estornos"} do ${channelLabels[channel]}`;
  const result = await tx.financialCategory.upsert({ where: { organizationId_name_kind: { organizationId, name, kind } }, create: { organizationId, name, kind }, update: {} });
  await tx.$queryRaw`SELECT "id" FROM "FinancialCategory" WHERE "id" = ${result.id} FOR SHARE`;
  return result.id;
}
async function audit(tx: Tx, scope: Scope, id: string, reason: string) {
  await tx.auditEvent.create({ data: { ...scope, action: "CREATE", entityType: "FinancialEntry", entityId: id, reason } });
}

// Caller and replay endpoint both lock the sale before synchronizing. Unconfigured
// payments remain visibly pending configuration, never silently valued at zero fees.
export async function syncPosSale(tx: Tx, scope: Scope, saleId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "id" = ${saleId} AND "organizationId" = ${scope.organizationId} AND "establishmentId" = ${scope.establishmentId} FOR UPDATE`;
  const sale = await tx.sale.findFirst({ where: { id: saleId, organizationId: scope.organizationId, establishmentId: scope.establishmentId, financeTracked: true, status: { not: "CANCELLED" } }, include: { payments: { include: { financialEntry: true } }, refunds: { include: { payments: { include: { financialEntry: true } } } } } });
  if (!sale) return 0;
  const rules = await tx.posReceiptRule.findMany({ where: { organizationId: scope.organizationId, establishmentId: scope.establishmentId, active: true, bankAccount: { active: true, establishmentId: scope.establishmentId, establishment: { organizationId: scope.organizationId } } } });
  let created = 0;
  for (const payment of sale.payments) {
    if (payment.financialEntry) continue;
    const rule = rules.find(r => r.method === payment.method); if (!rule) continue;
    const plan = receiptPlan(payment.amount, sale.completedAt, rule);
    const immediate = (payment.method === "CASH" || payment.method === "PIX") && plan.dueDate === businessDay(sale.completedAt);
    const entry = await tx.financialEntry.create({ data: {
      organizationId: scope.organizationId, establishmentId: scope.establishmentId, createdById: scope.actorId,
      categoryId: await category(tx, scope.organizationId, "INCOME", sale.channel), bankAccountId: rule.bankAccountId,
      sourcePaymentId: payment.id, sourceLabel: rule.name, description: `${channelLabels[sale.channel]} ${sale.id.slice(-8)} · ${posMethodLabels[payment.method] ?? payment.method}`,
      amount: decimal(plan.netCents), grossAmount: decimal(plan.grossCents), feeAmount: decimal(plan.feeCents), feeRateSnapshot: rule.feeRate, settlementDaysSnapshot: rule.settlementDays,
      dueDate: new Date(plan.dueDate), status: immediate ? "PAID" : "PENDING", paidAt: immediate ? sale.completedAt : null,
      notes: `Gerado pela venda de ${channelLabels[sale.channel]}. Prazo em dias ${rule.businessDays ? "úteis (calendário configurado)" : "corridos"}. Cartão permanece previsto até confirmação do repasse.`,
    } });
    await audit(tx, scope, entry.id, `Recebível automático da venda ${sale.id}`); created++;
  }
  for (const refund of sale.refunds) for (const payment of refund.payments) {
    if (payment.financialEntry) continue;
    const original = await tx.financialEntry.findFirst({ where: { organizationId: scope.organizationId, establishmentId: scope.establishmentId, voidedAt: null, sourcePayment: { saleId, method: payment.method } }, orderBy: { dueDate: "asc" } });
    const rule = rules.find(r => r.method === payment.method);
    const bankAccountId = original?.bankAccountId ?? rule?.bankAccountId; if (!bankAccountId) continue;
    const immediate = payment.method === "CASH" || payment.method === "PIX";
    const day = businessDay(refund.createdAt);
    const dueDate = !immediate && original?.status === "PENDING" && original.dueDate.toISOString().slice(0, 10) > day ? original.dueDate : new Date(day);
    const entry = await tx.financialEntry.create({ data: {
      organizationId: scope.organizationId, establishmentId: scope.establishmentId, createdById: scope.actorId,
      categoryId: await category(tx, scope.organizationId, "EXPENSE", sale.channel), bankAccountId, sourceRefundPaymentId: payment.id,
      description: `Reembolso ${channelLabels[sale.channel]} ${sale.id.slice(-8)} · ${posMethodLabels[payment.method] ?? payment.method}`,
      amount: payment.amount, grossAmount: payment.amount, feeAmount: "0", sourceLabel: original?.sourceLabel ?? rule?.name,
      dueDate, status: immediate ? "PAID" : "PENDING", paidAt: immediate ? refund.createdAt : null,
      notes: "Reembolso pelo valor devolvido ao cliente. Não presume devolução da taxa pela adquirente; ajuste eventual crédito de taxa após conferência. Cartão: confirme a data efetiva do desconto.",
    } });
    await audit(tx, scope, entry.id, `Reembolso automático da venda ${sale.id}`); created++;
  }
  return created;
}

export async function cancelPosReceipts(tx: Tx, scope: Scope, saleId: string) {
  const entries = await tx.financialEntry.findMany({ where: { organizationId: scope.organizationId, establishmentId: scope.establishmentId, sourcePayment: { saleId }, voidedAt: null }, include: { sourcePayment: { include: { sale: { select: { channel: true } } } } } });
  for (const entry of entries) {
    await tx.$queryRaw`SELECT "id" FROM "FinancialEntry" WHERE "id" = ${entry.id} FOR UPDATE`;
    const current = await tx.financialEntry.findUniqueOrThrow({ where: { id: entry.id } });
    if (current.status === "PENDING") {
      await tx.financialEntry.update({ where: { id: entry.id }, data: { voidedAt: new Date() } });
      await tx.auditEvent.create({ data: { ...scope, action: "UPDATE", entityType: "FinancialEntry", entityId: entry.id, reason: `Recebível anulado pelo cancelamento da venda ${saleId}` } });
    } else {
      const reversal = await tx.financialEntry.upsert({ where: { reversalOfId: entry.id }, update: {}, create: {
        organizationId: scope.organizationId, establishmentId: scope.establishmentId, createdById: scope.actorId, categoryId: await category(tx, scope.organizationId, "EXPENSE", entry.sourcePayment!.sale.channel), bankAccountId: current.bankAccountId,
        reversalOfId: entry.id, description: `Estorno de ${entry.description}`, amount: decimal(cents(current.amount)), dueDate: new Date(businessDay()), paidAt: ["CASH", "PIX"].includes(entry.sourcePayment?.method ?? "") ? new Date() : null, status: ["CASH", "PIX"].includes(entry.sourcePayment?.method ?? "") ? "PAID" : "PENDING",
        notes: "Contrapartida de cancelamento; mantém o recebimento original na trilha. Eventual cobrança residual de taxa deve ser conferida com a adquirente.",
      } });
      await audit(tx, scope, reversal.id, `Estorno financeiro do cancelamento da venda ${saleId}`);
    }
  }
}
