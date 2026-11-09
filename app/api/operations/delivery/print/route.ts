import { z } from "zod";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { getLocalDeliveryOrder } from "@/lib/local-delivery";
import { deliveryReceipt } from "@/lib/delivery-receipt";
import { saleReceiptEscpos } from "@/lib/sale-receipt";
import { requestAuditMetadata } from "@/lib/audit";

const schema = z.object({ orderId: z.string().min(1), mode: z.enum(["CONFERENCE", "RECEIPT"]), discount: z.number().finite().min(0).default(0), reprint: z.boolean().default(false) });
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados de impressão inválidos." }, { status: 400 });
  const data = parsed.data;
  try {
    const local = isLocalAuthEnabled();
    const session = local ? await getLocalSession() : await getCurrentSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canOperateDelivery || (!local && !await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: "ACTIVE" } }))) return Response.json({ error: "Acesso negado ao delivery." }, { status: 403 });
    if (data.reprint && !session.canReprint) return Response.json({ error: "Você não tem permissão para reimprimir comprovantes." }, { status: 403 });
    const order = local ? getLocalDeliveryOrder(session.establishment.id, data.orderId) : await db.deliveryOrder.findFirst({ where: { id: data.orderId, establishmentId: session.establishment.id }, include: { items: true, sale: { include: { items: true, payments: true } } } });
    if (!order) return Response.json({ error: "Pedido não encontrado nesta unidade." }, { status: 404 });
    const unit = local ? session.establishment : await db.establishment.findUniqueOrThrow({ where: { id: session.establishment.id }, select: { name: true, document: true } });
    let receipt;
    try { receipt = deliveryReceipt(order, unit, data.mode, data.discount); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Pedido indisponível para impressão." }, { status: 409 }); }
    const payload = saleReceiptEscpos(receipt);
    const agent = local ? null : await db.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true, receiptsActivatedAt: { not: null } }, orderBy: { activatedAt: "desc" } });
    let message = "Documento preparado para impressão.";
    if (agent) {
      if (data.mode === "CONFERENCE") {
        await db.kitchenPrintJob.create({ data: { agentId: agent.id, conferenceDeliveryOrderId: order.id, payload } });
        message = "Conferência enviada à impressora. O pedido continua aberto.";
      } else {
        // Same unique sale job as the automatic agent: checkout and polling cannot duplicate it.
        const job = await db.kitchenPrintJob.upsert({ where: { agentId_saleId: { agentId: agent.id, saleId: receipt.saleId } }, create: { agentId: agent.id, saleId: receipt.saleId, payload }, update: {} });
        if (data.reprint && job.status === "SENT") {
          await db.$transaction(async tx => {
            const changed = await tx.kitchenPrintJob.updateMany({ where: { id: job.id, status: "SENT" }, data: { status: "PENDING", payload } });
            if (changed.count) await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "PRINT_REPRINT", entityType: "Sale", entityId: receipt.saleId, reason: "Reimpressão do comprovante no Delivery", ...requestAuditMetadata(request) } });
          });
        } else if (["REVIEW", "SKIPPED"].includes(job.status)) return Response.json({ error: "A impressão anterior precisa de revisão. Confira a impressora antes de repetir." }, { status: 409 });
        message = job.status === "SENT" && !data.reprint ? "Comprovante já enviado à impressora." : "Comprovante enviado à fila da impressora.";
      }
    }
    const methods: Record<string, string> = { CASH: "Dinheiro", PIX: "Pix", CREDIT_CARD: "Crédito", DEBIT_CARD: "Débito", OTHER: "Outros" };
    return Response.json({ queued: Boolean(agent), message, receipt: { establishmentName: receipt.establishment, channel: "DELIVERY", label: receipt.label, notice: receipt.notice, totalLabel: receipt.totalLabel, conference: receipt.conference, items: receipt.items, subtotal: receipt.subtotal, serviceAmount: receipt.serviceAmount, deliveryFee: receipt.deliveryFee, discount: receipt.discount, total: receipt.total, payment: receipt.payments.map(p => `${methods[p.method] ?? p.method}: R$ ${p.amount.toFixed(2)}${p.changeAmount ? ` (troco R$ ${p.changeAmount.toFixed(2)})` : ""}`).join(" + ") }, template: { showDocument: true, establishmentDocument: receipt.document } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("delivery_print_failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Não foi possível enviar a impressão. O pagamento e o pedido não foram alterados por esta tentativa." }, { status: 500 });
  }
}
