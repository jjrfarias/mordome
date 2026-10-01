import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { automationSchema, readWhatsAppAutomation, writeWhatsAppAutomation } from "@/lib/whatsapp-automation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const actor = await getCurrentSession();
  if (!actor?.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
  return Response.json({ automation: await readWhatsAppAutomation(actor.establishment.id) }, { headers: { "Cache-Control": "no-store, private" } });
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Origem inválida." }, { status: 403 });
  const actor = await getCurrentSession();
  if (!actor?.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = automationSchema.safeParse((await request.json().catch(() => null))?.automation);
  if (!parsed.success) return Response.json({ error: "Confira os textos e mantenha cada mensagem com até 500 caracteres." }, { status: 400 });
  await writeWhatsAppAutomation(actor.establishment.id, parsed.data);
  await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "WhatsAppAutomation", entityId: actor.establishment.id, reason: "Automações de delivery do WhatsApp atualizadas" } });
  return Response.json({ automation: parsed.data }, { headers: { "Cache-Control": "no-store, private" } });
}
