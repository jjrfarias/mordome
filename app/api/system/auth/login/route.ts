import { normalizeUsername, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSystemSession, systemRequestMetadata } from "@/lib/system-auth";
import { systemLoginSchema } from "@/lib/system-validation";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = systemLoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Usuário ou senha inválidos." }, { status: 400 });
  const username = normalizeUsername(parsed.data.username);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `system-login:${ip}:${username}`;
  const attempt = rateLimit(key, 5, 10 * 60 * 1000);
  if (!attempt.allowed) return Response.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } });
  const admin = await db.systemAdmin.findUnique({ where: { username } });
  if (!admin || !admin.active || !(await verifyPassword(parsed.data.password, admin.passwordHash))) return Response.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
  resetRateLimit(key);
  await createSystemSession(admin.id, request);
  await db.platformAuditEvent.create({ data: { adminId: admin.id, action: "LOGIN", entityType: "SystemAdminSession", entityId: admin.id, reason: "Login no painel do sistema", ...systemRequestMetadata(request) } });
  return Response.json({ ok: true });
}
