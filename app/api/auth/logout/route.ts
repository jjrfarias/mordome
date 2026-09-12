import { destroySession, getCurrentSession, isSameOrigin } from "@/lib/auth";
import { destroyLocalSession, getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { db } from "@/lib/db";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) { const session = await getLocalSession(); if (session) recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "LOGOUT", entityType: "Session", entityId: session.sessionId, reason: "Sessão encerrada", ...requestAuditMetadata(request) }); await destroyLocalSession(); return Response.json({ ok: true }); }
  const session = await getCurrentSession();
  if (session) await db.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "LOGOUT", entityType: "Session", entityId: session.sessionId, reason: "Sessão encerrada", ...requestAuditMetadata(request) } });
  await destroySession();
  return Response.json({ ok: true });
}
