import { createSession, isSameOrigin, normalizeUsername } from "@/lib/auth";
import { loginSchema } from "@/lib/auth-validation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createLocalSession, isLocalAuthEnabled, localCredentialsAreValid } from "@/lib/local-auth";

const dummyHash = hashPassword("invalid-password-0");

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Usuário ou senha inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    if (!localCredentialsAreValid(normalizeUsername(parsed.data.username), parsed.data.password)) return Response.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    await createLocalSession();
    return Response.json({ ok: true });
  }

  const user = await db.user.findUnique({ where: { username: normalizeUsername(parsed.data.username) } });
  const passwordIsValid = await verifyPassword(parsed.data.password, user?.passwordHash ?? await dummyHash);
  if (!user || !passwordIsValid || !user.active) {
    return Response.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const membership = await db.organizationMembership.findFirst({
    where: { userId: user.id, status: "ACTIVE", organization: { active: true }, accesses: { some: { establishment: { active: true } } } },
  });
  if (!membership) return Response.json({ error: "Seu usuário não possui acesso ativo." }, { status: 403 });

  await createSession(user.id, request);
  await db.auditEvent.create({
    data: { organizationId: membership.organizationId, actorId: user.id, action: "LOGIN", entityType: "Session", entityId: user.id, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() },
  });
  return Response.json({ ok: true });
}
