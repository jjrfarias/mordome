import { z } from "zod";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { customerLoginConfigured, whatsappGateway } from "@/lib/whatsapp-gateway";

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const actor = await getCurrentSession();
  if (!actor?.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
  if (!customerLoginConfigured()) return Response.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  try { return Response.json({ configured: true, ...await whatsappGateway(actor.establishment.id, "status") }, { headers: { "Cache-Control": "no-store, private" } }); }
  catch { return Response.json({ configured: true, status: "UNAVAILABLE" }, { headers: { "Cache-Control": "no-store" } }); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Origem inválida." }, { status: 403 });
  const actor = await getCurrentSession();
  if (!actor?.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = z.object({ action: z.enum(["connect", "disconnect"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ação inválida." }, { status: 400 });
  try {
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "WhatsAppConnection", entityId: actor.establishment.id, reason: parsed.data.action === "connect" ? "Solicitada conexão do WhatsApp para códigos de acesso" : "Solicitada desconexão do WhatsApp" } });
    const result = await whatsappGateway(actor.establishment.id, parsed.data.action);
    return Response.json(result, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ error: "Conector indisponível. Tente novamente em alguns instantes." }, { status: 503 }); }
}
