import { isSameOrigin } from "@/lib/auth";
import { destroySystemSession, getSystemAdminSession, systemRequestMetadata } from "@/lib/system-auth";
import { db } from "@/lib/db";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const session = await getSystemAdminSession();
  if (session) await db.platformAuditEvent.create({ data: { adminId: session.admin.id, action: "LOGOUT", entityType: "SystemAdminSession", entityId: session.sessionId, reason: "Logout do painel do sistema", ...systemRequestMetadata(request) } });
  await destroySystemSession();
  return Response.json({ ok: true });
}
