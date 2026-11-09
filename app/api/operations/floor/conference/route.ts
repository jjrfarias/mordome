import { z } from "zod";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { selectedOptionNames } from "@/lib/kitchen-print";
import { saleReceiptEscpos } from "@/lib/sale-receipt";
import { GET as getFloor } from "../route";

const schema = z.object({ tabId: z.string().min(1), waiveService: z.boolean().default(false), discount: z.number().finite().min(0).default(0) });
type FloorTable = { number: number; tabs: { id: string; name?: string; items: { productName: string; quantity: number; unitPrice: number; selectedOptionsSnapshot?: unknown; notes?: string | null }[] }[] };

export async function POST(request: Request) {
  try { return await printConference(request); }
  catch (error) {
    console.error("conference_print_failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Não foi possível enviar a conferência à impressora. A comanda continua aberta." }, { status: 500 });
  }
}

async function printConference(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados de conferência inválidos." }, { status: 400 });
  // Reuse the salon's authorization, waiter scope and linked-order item projection.
  const floorResponse = await getFloor(request);
  if (!floorResponse.ok) return floorResponse;
  const floor = await floorResponse.json() as { tables: FloorTable[]; serviceRate?: number };
  const table = floor.tables.find(table => table.tabs.some(tab => tab.id === parsed.data.tabId));
  const tab = table?.tabs.find(tab => tab.id === parsed.data.tabId);
  if (!table || !tab) return Response.json({ error: "Comanda aberta não encontrada." }, { status: 404 });
  const session = isLocalAuthEnabled() ? await getLocalSession() : await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const items = tab.items.filter(item => item.quantity > 0).map(item => ({ name: [item.productName, ...selectedOptionNames(item.selectedOptionsSnapshot), ...(item.notes ? [`OBS: ${item.notes}`] : [])].join(" - "), quantity: item.quantity, unitPrice: item.unitPrice, total: Math.round(item.quantity * item.unitPrice * 100) / 100 }));
  if (!items.length) return Response.json({ error: "Comanda sem consumo." }, { status: 409 });
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  const serviceAmount = parsed.data.waiveService ? 0 : Math.round(subtotal * (floor.serviceRate ?? 10)) / 100;
  const discount = Math.round(parsed.data.discount * 100) / 100;
  if (discount > subtotal + serviceAmount) return Response.json({ error: "Desconto maior que o total." }, { status: 400 });
  const unit = isLocalAuthEnabled() ? null : await db.establishment.findUnique({ where: { id: session.establishment.id }, select: { document: true } });
  const receipt = { establishmentName: session.establishment.name, items, subtotal, serviceAmount, discount, total: Math.round((subtotal + serviceAmount - discount) * 100) / 100, payment: "", channel: "FLOOR" as const, table: table.number, tabName: tab.name, conference: true };
  const agent = isLocalAuthEnabled() ? null : await db.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true, receiptsActivatedAt: { not: null } }, orderBy: { activatedAt: "desc" } });
  if (agent) {
    const payload = saleReceiptEscpos({ establishment: receipt.establishmentName, document: unit?.document, saleId: tab.id, completedAt: new Date(), label: `Mesa ${table.number}${tab.name ? ` - ${tab.name}` : ""}`, items, subtotal, discount, serviceAmount, serviceWaived: parsed.data.waiveService, deliveryFee: 0, total: receipt.total, payments: [], conference: true });
    await db.kitchenPrintJob.create({ data: { agentId: agent.id, conferenceTabId: tab.id, payload } });
  }
  return Response.json({ queued: Boolean(agent), receipt, template: { showDocument: true, establishmentDocument: unit?.document } }, { headers: { "Cache-Control": "no-store" } });
}
