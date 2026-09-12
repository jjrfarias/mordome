import { createSession, isSameOrigin, normalizeUsername } from "@/lib/auth";
import { loginSchema } from "@/lib/auth-validation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createLocalSession, isLocalAuthEnabled, localCredentialsAreValid } from "@/lib/local-auth";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const dummyHash = hashPassword("invalid-password-0");
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Usuário ou senha inválidos." }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const username = normalizeUsername(parsed.data.username);
  const rateLimitKey = `login:${ip}:${username}`;
  const attempt = rateLimit(rateLimitKey, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
  if (!attempt.allowed) {
    return Response.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } },
    );
  }

  if (isLocalAuthEnabled()) {
    if (!localCredentialsAreValid(username, parsed.data.password)) return Response.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    resetRateLimit(rateLimitKey);
    await createLocalSession(username);
    recordLocalAudit({ organizationId: "local-betao", establishmentId: null, actorId: "local-admin", actorName: "Administrador Betão", actorUsername: username, action: "LOGIN", entityType: "Session", entityId: "local", reason: "Login realizado", ...requestAuditMetadata(request) });
    return Response.json({ ok: true });
  }

  const user = await db.user.findUnique({ where: { username } });
  const passwordIsValid = await verifyPassword(parsed.data.password, user?.passwordHash ?? await dummyHash);
  if (!user || !passwordIsValid || !user.active) {
    return Response.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  resetRateLimit(rateLimitKey);

  const membership = await db.organizationMembership.findFirst({
    where: { userId: user.id, status: "ACTIVE", organization: { active: true }, accesses: { some: { establishment: { active: true } } } },
  });
  if (!membership) return Response.json({ error: "Seu usuário não possui acesso ativo." }, { status: 403 });

  await createSession(user.id, request);
  await db.auditEvent.create({
    data: { organizationId: membership.organizationId, actorId: user.id, action: "LOGIN", entityType: "Session", entityId: user.id, reason: "Login realizado", ...requestAuditMetadata(request) },
  });
  return Response.json({ ok: true });
}
