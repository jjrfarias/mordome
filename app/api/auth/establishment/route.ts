import { getCurrentSession, isSameOrigin, selectEstablishment } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled, selectLocalEstablishment } from "@/lib/local-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const inputSchema = z.object({ establishmentId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unidade inválida." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const previous = await getLocalSession();
    if (!await selectLocalEstablishment(parsed.data.establishmentId)) return Response.json({ error: "Acesso negado a esta unidade." }, { status: 403 });
    const selected = await getLocalSession();
    if (previous && selected && previous.establishment.id !== selected.establishment.id) recordLocalAudit({ organizationId: selected.organization.id, establishmentId: selected.establishment.id, establishmentName: selected.establishment.name, actorId: selected.user.id, actorName: selected.user.name, actorUsername: selected.user.username, action: "ESTABLISHMENT_SWITCH", entityType: "Session", entityId: selected.sessionId, reason: "Unidade ativa alterada", before: { establishmentId: previous.establishment.id, establishmentName: previous.establishment.name }, after: { establishmentId: selected.establishment.id, establishmentName: selected.establishment.name }, ...requestAuditMetadata(request) });
    return Response.json({ session: selected });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const allowed = session.establishments.map(establishment => establishment.id);
  if (!await selectEstablishment(session.sessionId, parsed.data.establishmentId, allowed)) return Response.json({ error: "Acesso negado a esta unidade." }, { status: 403 });
  const selected = await getCurrentSession();
  if (selected && session.establishment.id !== selected.establishment.id) await db.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: selected.establishment.id, actorId: session.user.id, action: "ESTABLISHMENT_SWITCH", entityType: "Session", entityId: session.sessionId, reason: "Unidade ativa alterada", before: { establishmentId: session.establishment.id, establishmentName: session.establishment.name }, after: { establishmentId: selected.establishment.id, establishmentName: selected.establishment.name }, ...requestAuditMetadata(request) } });
  return Response.json({ session: selected });
}
