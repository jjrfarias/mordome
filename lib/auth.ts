import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "mordome_session";
const SESSION_DAYS = 7;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("pt-BR");
}

export async function createSession(userId: string, request: Request) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const firstAccess = await db.establishmentAccess.findFirst({ where: { membership: { userId, status: "ACTIVE" }, establishment: { active: true } }, orderBy: { establishment: { name: "asc" } } });
  await db.session.create({
    data: {
      userId,
      activeEstablishmentId: firstAccess?.establishmentId,
      tokenHash: tokenHash(token),
      expiresAt,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent")?.slice(0, 500),
    },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        include: {
          memberships: {
            where: { status: "ACTIVE" },
            include: { organization: true, accesses: { include: { establishment: true } } },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.active) {
    if (session) await db.session.delete({ where: { id: session.id } });
    return null;
  }

  const membership = session.user.memberships[0];
  const establishments = membership?.accesses.map(access => access.establishment).filter(establishment => establishment.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) ?? [];
  const establishment = establishments.find(item => item.id === session.activeEstablishmentId) ?? establishments[0];
  if (!membership || !membership.organization.active || !establishment?.active) return null;

  return {
    sessionId: session.id,
    user: { id: session.user.id, name: session.user.name, username: session.user.username },
    organization: { id: membership.organization.id, name: membership.organization.name },
    establishment: { id: establishment.id, name: establishment.name },
    establishments: establishments.map(item => ({ id: item.id, name: item.name })),
  };
}

export async function selectEstablishment(sessionId: string, establishmentId: string, allowedIds: string[]) {
  if (!allowedIds.includes(establishmentId)) return false;
  await db.session.update({ where: { id: sessionId }, data: { activeEstablishmentId: establishmentId, lastSeenAt: new Date() } });
  return true;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!forwardedHost) return false;
  try {
    return new URL(origin).host === forwardedHost;
  } catch {
    return false;
  }
}
