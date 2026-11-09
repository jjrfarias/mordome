import { ifoodMetadata } from "@/lib/ifood-import";
import { fulfillmentLabel } from "@/lib/order-fulfillment";
import { z } from "zod";
import { db } from "@/lib/db";
import { kitchenEscpos, printTokenHash, selectedOptionNames } from "@/lib/kitchen-print";
import { queueSaleReceipts } from "@/lib/receipt-print-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authenticate(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  const agent = await db.kitchenPrintAgent.findUnique({ where: { tokenHash: printTokenHash(token) }, include: { establishment: { include: { organization: true } } } });
  if (!agent?.active || !agent.establishment.active || !agent.establishment.organization.active) return null;
  return agent;
}

export async function GET(request: Request) {
  const agent = await authenticate(request);
  if (!agent) return Response.json({ error: "Agente não autorizado." }, { status: 401 });
  // Scan committed orders, not the browser response: covers salão, PDV and delivery,
  // including orders sent while this PC was offline. Activation excludes old tickets.
  const orders = await db.order.findMany({
    where: { sentAt: { gte: agent.activatedAt }, status: { not: "CANCELLED" }, tab: { establishmentId: agent.establishmentId }, kitchenPrintJobs: { none: { agentId: agent.id } } },
    orderBy: [{ sentAt: "asc" }, { id: "asc" }], take: 50,
    include: { tab: { include: { table: true } }, items: { include: { cancellations: true, tabItem: true } } },
  });
  for (const order of orders) {
    const items = order.items.map(item => ({ name: [item.productName, ...selectedOptionNames(item.tabItem.selectedOptionsSnapshot), ...(item.tabItem.notes ? [`OBS: ${item.tabItem.notes}`] : [])].join(" - "), quantity: Number(item.quantity) - item.cancellations.reduce((sum, item) => sum + Number(item.quantity), 0) })).filter(item => item.quantity > 0);
    const delivery = await db.deliveryOrder.findFirst({ where: { establishmentId: agent.establishmentId, OR: [{ kitchenOrderId: order.id }, { id: order.deliveryParentId ?? "" }] }, select: { customerName: true, fulfillment: true, origin: true, ifoodImport: true } });
    const label = delivery?.origin === "IFOOD" ? `iFood #${ifoodMetadata(delivery.ifoodImport)?.displayId ?? ""} - ${delivery.customerName}` : delivery ? `${fulfillmentLabel(delivery)} - ${delivery.customerName}` : order.tab.table.isCounter ? "Balcao" : `Mesa ${order.tab.table.number}${order.tab.name ? ` - ${order.tab.name}` : ""}`;
    await db.kitchenPrintJob.upsert({ where: { agentId_orderId: { agentId: agent.id, orderId: order.id } }, update: {}, create: { agentId: agent.id, orderId: order.id, status: items.length ? "PENDING" : "SKIPPED", payload: kitchenEscpos({ establishment: agent.establishment.name, label: order.deliveryParentId ? `COMPLEMENTO - ${label}` : label, orderId: order.id, sentAt: order.sentAt, items }) } });
  }
  await queueSaleReceipts(db, agent);
  await db.kitchenPrintAgent.update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } });
  const jobs = await db.kitchenPrintJob.findMany({ where: { agentId: agent.id, status: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20, select: { id: true } });
  const uncertain = await db.kitchenPrintJob.count({ where: { agentId: agent.id, status: { in: ["SENDING", "REVIEW"] } } });
  return Response.json({ jobs, uncertain }, { headers: { "Cache-Control": "no-store" } });
}

const action = z.object({ jobId: z.string().min(1).max(100), action: z.enum(["CLAIM", "ACK"]) });

export async function POST(request: Request) {
  const agent = await authenticate(request);
  if (!agent) return Response.json({ error: "Agente não autorizado." }, { status: 401 });
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const { jobId, action: operation } = parsed.data;
  const job = await db.kitchenPrintJob.findFirst({ where: { id: jobId, agentId: agent.id }, include: { sale: true, order: { include: { items: { include: { cancellations: true } } } } } });
  if (!job) return Response.json({ error: "Comanda não encontrada." }, { status: 404 });
  if (operation === "ACK") {
    await db.kitchenPrintJob.updateMany({ where: { id: job.id, agentId: agent.id, status: "SENDING" }, data: { status: "SENT" } });
    return Response.json({ ok: true });
  }
  // Changes after queuing need operator review; never print a stale cancelled item.
  if ((job.sale && job.sale.status !== "COMPLETED") || (job.order && (job.order.status === "CANCELLED" || job.order.items.some(item => item.cancellations.length)))) {
    await db.kitchenPrintJob.updateMany({ where: { id: job.id, agentId: agent.id, status: "PENDING" }, data: { status: "REVIEW" } });
    return Response.json({ error: "Pedido cancelado ou alterado; confira na cozinha." }, { status: 409 });
  }
  const claimed = await db.kitchenPrintJob.updateMany({ where: { id: job.id, agentId: agent.id, status: "PENDING", ...(job.saleId ? { sale: { status: "COMPLETED", establishmentId: agent.establishmentId } } : {}) }, data: { status: "SENDING" } });
  if (!claimed.count) return Response.json({ error: "Comanda já reservada." }, { status: 409 });
  return Response.json({ id: job.id, payload: job.payload }, { headers: { "Cache-Control": "no-store" } });
}
