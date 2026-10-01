import { z } from "zod";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { customerLoginConfigured, whatsappGateway } from "@/lib/whatsapp-gateway";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const actor = await getCurrentSession();
  if (!actor?.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
  if (!customerLoginConfigured()) return Response.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  const connection = await db.whatsAppConnection.findUnique({ where: { establishmentId: actor.establishment.id }, select: { orderingEnabled: true } });
  try { return Response.json({ configured: true, orderingEnabled: connection?.orderingEnabled ?? false, ...await whatsappGateway(actor.establishment.id, "resume") }, { headers: { "Cache-Control": "no-store, private" } }); }
  catch { return Response.json({ configured: true, orderingEnabled: connection?.orderingEnabled ?? false, status: "UNAVAILABLE" }, { headers: { "Cache-Control": "no-store" } }); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Origem inválida." }, { status: 403 });
  const actor = await getCurrentSession();
  if (!actor?.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = z.object({ action: z.enum(["connect", "disconnect", "set-ordering"]), enabled: z.boolean().optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.action === "set-ordering" && parsed.data.enabled === undefined)) return Response.json({ error: "Ação inválida." }, { status: 400 });
  try {
    const reason = parsed.data.action === "connect" ? "Solicitada conexão do WhatsApp" : parsed.data.action === "disconnect" ? "Solicitada desconexão do WhatsApp" : parsed.data.enabled ? "Ativado atendimento automático para pedidos pelo WhatsApp" : "Desativado atendimento automático para pedidos pelo WhatsApp";
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "WhatsAppConnection", entityId: actor.establishment.id, reason } });
    if (parsed.data.action === "set-ordering") {
      await db.whatsAppConnection.upsert({ where: { establishmentId: actor.establishment.id }, create: { establishmentId: actor.establishment.id, orderingEnabled: parsed.data.enabled! }, update: { orderingEnabled: parsed.data.enabled! } });
      return Response.json({ orderingEnabled: parsed.data.enabled }, { headers: { "Cache-Control": "no-store, private" } });
    }
    const result = await whatsappGateway(actor.establishment.id, parsed.data.action);
    return Response.json(result, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ error: "Conector indisponível. Tente novamente em alguns instantes." }, { status: 503 }); }
}
