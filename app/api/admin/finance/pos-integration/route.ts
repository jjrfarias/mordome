import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { isLocalAuthEnabled } from "@/lib/local-auth";
import { cents, validDay } from "@/lib/finance-ledger";
import { financeMoneySchema } from "@/lib/finance-validation";
import { posMethods } from "@/lib/pos-receipts";
import { syncPosSale } from "@/lib/pos-finance";

const schema = z.object({
  method: z.enum(posMethods), name: z.string().trim().min(2).max(60), bankAccountId: z.string().min(1),
  feeRate: financeMoneySchema.refine(v => cents(v) >= 0 && cents(v) < 10000, "Taxa deve ficar entre 0 e 99,99%."),
  settlementDays: z.number().int().min(0).max(365), businessDays: z.boolean(),
  holidays: z.array(z.string().refine(validDay)).max(400).default([]), active: z.boolean(),
}).refine(v => v.method !== "CASH" || (cents(v.feeRate) === 0 && v.settlementDays === 0 && !v.businessDays), "Dinheiro é recebido no ato, sem taxa de adquirente.");
async function actor(request: Request) {
  if (!isSameOrigin(request)) return null;
  if (isLocalAuthEnabled()) return null;
  const session = await getCurrentSession();
  return session?.canManageFinance ? { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id } : null;
}
export async function GET(request: Request) {
  const scope = await actor(request); if (!scope) return Response.json({ error: "Acesso negado. A integração requer o ambiente com banco de dados." }, { status: 403 });
  const saleScope = { organizationId: scope.organizationId, establishmentId: scope.establishmentId, financeTracked: true, status: { not: "CANCELLED" as const } };
  const [rules, accounts, pending, refunds] = await Promise.all([
    db.posReceiptRule.findMany({ where: { organizationId: scope.organizationId, establishmentId: scope.establishmentId }, orderBy: { method: "asc" } }),
    db.bankAccount.findMany({ where: { establishmentId: scope.establishmentId, establishment: { organizationId: scope.organizationId } }, select: { id: true, name: true, active: true } }),
    db.payment.findMany({ where: { sale: saleScope, financialEntry: null }, select: { method: true, amount: true } }),
    db.refundPayment.count({ where: { refund: { sale: saleScope }, financialEntry: null } }),
  ]);
  return Response.json({ rules, accounts, pending: posMethods.map(method => ({ method, count: pending.filter(p => p.method === method).length, grossCents: pending.filter(p => p.method === method).reduce((sum, p) => sum + cents(p.amount), 0) })), pendingRefunds: refunds }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request) {
  const scope = await actor(request); if (!scope) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Regra inválida." }, { status: 400 });
  const data = parsed.data;
  if (!await db.bankAccount.count({ where: { id: data.bankAccountId, establishmentId: scope.establishmentId, establishment: { organizationId: scope.organizationId }, active: true } })) return Response.json({ error: "Conta de destino inválida para esta unidade." }, { status: 409 });
  try {
    const rule = await db.$transaction(async tx => {
      const before = await tx.posReceiptRule.findUnique({ where: { establishmentId_method: { establishmentId: scope.establishmentId, method: data.method } } });
      const result = await tx.posReceiptRule.upsert({ where: { establishmentId_method: { establishmentId: scope.establishmentId, method: data.method } }, create: { organizationId: scope.organizationId, establishmentId: scope.establishmentId, ...data }, update: data });
      await tx.auditEvent.create({ data: { ...scope, action: before ? "UPDATE" : "CREATE", entityType: "PosReceiptRule", entityId: result.id, reason: `Configuração do recebimento PDV: ${data.name}`, before: before ? { feeRate: before.feeRate.toString(), settlementDays: before.settlementDays, bankAccountId: before.bankAccountId, active: before.active, businessDays: before.businessDays, holidays: before.holidays } : undefined, after: data } });
      return result;
    });
    return Response.json({ rule });
  } catch { return Response.json({ error: "Não foi possível salvar a regra. Atualize e tente novamente." }, { status: 409 }); }
}
export async function POST(request: Request) {
  const scope = await actor(request); if (!scope) return Response.json({ error: "Acesso negado." }, { status: 403 });
  // Only new tracked sales. No historical backfill that might duplicate manual receipts.
  const available = await db.posReceiptRule.findMany({ where: { organizationId: scope.organizationId, establishmentId: scope.establishmentId, active: true, bankAccount: { active: true } }, select: { method: true } });
  const methods = available.map(rule => rule.method);
  const sales = await db.sale.findMany({ where: { organizationId: scope.organizationId, establishmentId: scope.establishmentId, financeTracked: true, status: { not: "CANCELLED" }, OR: [{ payments: { some: { financialEntry: null, method: { in: methods } } } }, { refunds: { some: { payments: { some: { financialEntry: null, method: { in: methods } } } } } }] }, select: { id: true }, orderBy: { completedAt: "asc" }, take: 100 });
  let created = 0;
  try {
    for (const sale of sales) created += await db.$transaction(tx => syncPosSale(tx, scope, sale.id), { timeout: 15000 });
    return Response.json({ created, checked: sales.length, message: "Pendências processadas com as regras atuais. Pagamentos sem regra ativa continuam aguardando configuração." });
  } catch { return Response.json({ error: "O processamento foi interrompido. Pode repetir com segurança: recebíveis existentes não serão duplicados." }, { status: 409 }); }
}
