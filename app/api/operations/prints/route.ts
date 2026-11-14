import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { requestAuditMetadata } from "@/lib/audit";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalAudit, recordLocalAudit } from "@/lib/local-audit";
import { kitchenEscpos, selectedOptionNames } from "@/lib/kitchen-print";
import { isMarketplaceOrder, marketplaceLabel, ifoodMetadata } from "@/lib/ifood-import";
import { fulfillmentLabel } from "@/lib/order-fulfillment";

const schema = z.object({ entityType: z.enum(["Sale", "Order"]), entityId: z.string().min(1), destination: z.enum(["BROWSER", "AGENT"]).default("BROWSER"), reason: z.string().trim().min(3).max(200).default("Reimpressão solicitada pelo operador") });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Dados de reimpressão inválidos." }, { status: 400 }); const data = parsed.data;
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 }); if (!session.canReprint) return Response.json({ error: "Você não tem permissão para reimprimir." }, { status: 403 });
    if (data.destination === "AGENT") return Response.json({ error: "Serviço de impressão indisponível nesta instalação." }, { status: 409 });
    const action = data.entityType === "Sale" ? "SALE_COMPLETE" : "ORDER_SENT"; const exists = listLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, action, limit: 1000 }).some(event => event.entityId === data.entityId); if (!exists) return Response.json({ error: "Registro não encontrado nesta unidade." }, { status: 404 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "PRINT_REPRINT", entityType: data.entityType, entityId: data.entityId, reason: data.reason, after: { requestedAt: new Date().toISOString() }, ...requestAuditMetadata(request) });
    return Response.json({ registered: true }, { status: 201 });
  }
  const session = await getCurrentSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 }); if (!session.canReprint) return Response.json({ error: "Você não tem permissão para reimprimir." }, { status: 403 });
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } }); if (!membership) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const exists = data.entityType === "Sale" ? await db.sale.findFirst({ where: { id: data.entityId, organizationId: session.organization.id, establishmentId: session.establishment.id }, select: { id: true } }) : await db.order.findFirst({ where: { id: data.entityId, tab: { establishmentId: session.establishment.id } }, select: { id: true } }); if (!exists) return Response.json({ error: "Registro não encontrado nesta unidade." }, { status: 404 });
  if (data.destination === "AGENT") {
    if (data.entityType !== "Order") return Response.json({ error: "Escolha um pedido da cozinha." }, { status: 400 });
    const agent = await db.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true }, orderBy: { activatedAt: "desc" } });
    if (!agent) return Response.json({ error: "Nenhum serviço de impressão ativo nesta unidade." }, { status: 409 });
    const order = await db.order.findFirst({ where: { id: data.entityId, tab: { establishmentId: session.establishment.id } }, include: { tab: { include: { table: true } }, items: { include: { cancellations: true, tabItem: true } } } });
    if (!order || order.status === "CANCELLED" || order.items.some(item => item.cancellations.length)) return Response.json({ error: "Pedido alterado ou cancelado. Confira os itens antes de reimprimir." }, { status: 409 });
    const items = order.items.map(item => ({ name: [item.productName, ...selectedOptionNames(item.tabItem.selectedOptionsSnapshot), ...(item.tabItem.notes ? [`OBS: ${item.tabItem.notes}`] : [])].join(" - "), quantity: Number(item.quantity) })).filter(item => item.quantity > 0);
    if (!items.length) return Response.json({ error: "Pedido sem itens para imprimir." }, { status: 409 });
    const delivery = await db.deliveryOrder.findFirst({ where: { establishmentId: session.establishment.id, OR: [{ kitchenOrderId: order.id }, { id: order.deliveryParentId ?? "" }] }, select: { customerName: true, fulfillment: true, origin: true, ifoodImport: true } });
    const label = !order.tab.table.isCounter ? `Mesa ${order.tab.table.number}${order.tab.name ? ` - ${order.tab.name}` : ""}` : delivery && isMarketplaceOrder(delivery.origin) ? `${marketplaceLabel(delivery.origin)} #${ifoodMetadata(delivery.ifoodImport)?.displayId ?? ""} - ${delivery.customerName}` : delivery ? `${fulfillmentLabel(delivery)} - ${delivery.customerName}` : "Balcao";
    const payload = kitchenEscpos({ establishment: session.establishment.name, label: order.deliveryParentId ? `COMPLEMENTO - ${label}` : label, orderId: order.id, sentAt: order.sentAt, items });
    const queued = await db.$transaction(async tx => {
      const job = await tx.kitchenPrintJob.upsert({ where: { agentId_orderId: { agentId: agent.id, orderId: order.id } }, create: { agentId: agent.id, orderId: order.id, payload }, update: {} });
      if (job.status === "SENDING" || job.status === "REVIEW" || job.status === "SKIPPED") return false;
      if (job.status === "SENT") await tx.kitchenPrintJob.update({ where: { id: job.id }, data: { status: "PENDING", payload } });
      await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "PRINT_REPRINT", entityType: "Order", entityId: order.id, reason: data.reason, after: { requestedAt: new Date().toISOString(), destination: "AGENT" }, ...requestAuditMetadata(request) } });
      return true;
    });
    if (!queued) return Response.json({ error: "A impressão anterior ainda está em andamento ou precisa de revisão." }, { status: 409 });
    return Response.json({ registered: true, queued: true, message: "Pedido enviado à fila do serviço de impressão." }, { status: 201 });
  }
  await db.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "PRINT_REPRINT", entityType: data.entityType, entityId: data.entityId, reason: data.reason, after: { requestedAt: new Date().toISOString() }, ...requestAuditMetadata(request) } });
  return Response.json({ registered: true }, { status: 201 });
}
