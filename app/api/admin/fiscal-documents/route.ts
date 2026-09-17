import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { getLocalFiscalConfig, listLocalFiscalDocuments, upsertLocalFiscalDocument } from "@/lib/local-fiscal";
import { focusNfeProvider } from "@/lib/fiscal/focus-nfe";
import { mockFiscalProvider } from "@/lib/fiscal/mock-provider";
import type { FiscalPaymentInput, FiscalSaleItemInput } from "@/lib/fiscal/types";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RETRY"), saleId: z.string().min(1) }),
  z.object({ action: z.literal("CANCEL"), saleId: z.string().min(1), justification: z.string().trim().min(15).max(255) }),
]);

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageFiscal) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

// Notas fiscais emitidas (ADR 0049): tela de consulta/ação sobre o histórico de emissões — nunca
// dispara a primeira emissão (isso acontece automaticamente ao concluir a venda, ver
// `app/api/operations/sales/route.ts`), só reemite depois de um erro ou cancela dentro da janela
// permitida pela SEFAZ (30 minutos, valor do próprio provedor).
export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFiscal) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({ documents: listLocalFiscalDocuments(session.establishment.id) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const documents = await db.fiscalDocument.findMany({ where: { establishmentId: actor.establishment.id }, include: { sale: { select: { channel: true, total: true, completedAt: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return Response.json({ documents: documents.map(doc => ({ id: doc.id, saleId: doc.saleId, status: doc.status, environment: doc.environment, accessKey: doc.accessKey, number: doc.number, series: doc.series, statusMessage: doc.statusMessage, danfeUrl: doc.danfeUrl, qrCodeUrl: doc.qrCodeUrl, cancelledAt: doc.cancelledAt, createdAt: doc.createdAt, saleChannel: doc.sale.channel, saleTotal: Number(doc.sale.total), saleCompletedAt: doc.sale.completedAt })) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFiscal) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const config = getLocalFiscalConfig(session.establishment.id);
    if (!config.active || !config.providerApiToken) return Response.json({ error: "Módulo fiscal desativado para esta unidade." }, { status: 409 });
    if (data.action === "CANCEL") {
      const result = await mockFiscalProvider.cancel(data.saleId, data.justification, { apiToken: config.providerApiToken, environment: config.environment });
      const document = upsertLocalFiscalDocument(session.establishment.id, data.saleId, { status: result.status, statusMessage: result.statusMessage, cancelReason: result.status === "CANCELLED" ? data.justification : undefined, cancelledAt: result.status === "CANCELLED" ? new Date().toISOString() : undefined });
      return Response.json({ document });
    }
    // RETRY em modo local não tem itens/pagamentos reais da venda original pra reconstruir (o
    // provedor simulado nunca falha de verdade) — devolve o documento como está.
    return Response.json({ document: upsertLocalFiscalDocument(session.establishment.id, data.saleId, {}) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const config = await db.fiscalConfig.findUnique({ where: { establishmentId: actor.establishment.id } });
  if (!config?.active || !config.providerApiToken) return Response.json({ error: "Módulo fiscal desativado para esta unidade." }, { status: 409 });

  if (data.action === "CANCEL") {
    const result = await focusNfeProvider.cancel(data.saleId, data.justification, { apiToken: config.providerApiToken, environment: config.environment });
    try {
      const document = await db.fiscalDocument.update({ where: { saleId: data.saleId, establishmentId: actor.establishment.id }, data: { status: result.status, statusMessage: result.statusMessage, ...(result.status === "CANCELLED" ? { cancelReason: data.justification, cancelledAt: new Date() } : {}) } });
      return Response.json({ document });
    } catch {
      return Response.json({ error: "Nota fiscal não encontrada." }, { status: 404 });
    }
  }

  // RETRY: reconstrói o pedido a partir da venda já concluída (itens + pagamentos), mesma
  // montagem usada na emissão automática ao fechar a venda.
  const sale = await db.sale.findFirst({ where: { id: data.saleId, establishmentId: actor.establishment.id }, include: { items: { include: { product: { select: { ncm: true, cfop: true, icmsCst: true, icmsOrigin: true, unitOfMeasure: true } } } }, payments: true, establishment: { select: { document: true } } } });
  if (!sale) return Response.json({ error: "Venda não encontrada." }, { status: 404 });
  if (!sale.establishment.document) return Response.json({ error: "Cadastre o CNPJ da unidade antes de emitir." }, { status: 409 });
  const items: FiscalSaleItemInput[] = sale.items.map(item => ({ productName: item.productName, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), ncm: item.product?.ncm ?? null, cfop: item.product?.cfop ?? null, icmsCst: item.product?.icmsCst ?? null, icmsOrigin: item.product?.icmsOrigin ?? null, unitOfMeasure: item.product?.unitOfMeasure ?? null }));
  const payments: FiscalPaymentInput[] = sale.payments.map(payment => ({ method: payment.method, amount: Number(payment.amount) }));
  const result = await focusNfeProvider.emit({ saleId: sale.id, cnpj: sale.establishment.document, items, payments }, { apiToken: config.providerApiToken, environment: config.environment });
  const document = await db.fiscalDocument.upsert({
    where: { saleId: sale.id },
    update: { status: result.status, environment: config.environment, statusMessage: result.statusMessage, ...(result.status === "AUTHORIZED" ? { accessKey: result.accessKey, number: result.number, series: result.series, danfeUrl: result.danfeUrl, qrCodeUrl: result.qrCodeUrl } : {}) },
    create: { establishmentId: actor.establishment.id, saleId: sale.id, status: result.status, environment: config.environment, statusMessage: result.statusMessage, ...(result.status === "AUTHORIZED" ? { accessKey: result.accessKey, number: result.number, series: result.series, danfeUrl: result.danfeUrl, qrCodeUrl: result.qrCodeUrl } : {}) },
  });
  return Response.json({ document });
}
