import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const SYSTEM_COOKIE = "mordome_system_session";
const SESSION_HOURS = 12;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function systemRequestMetadata(request: Request) {
  return {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  };
}

export async function createSystemSession(adminId: string, request: Request) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await db.systemAdminSession.create({ data: { adminId, tokenHash: tokenHash(token), expiresAt, ...systemRequestMetadata(request) } });
  (await cookies()).set(SYSTEM_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: expiresAt, priority: "high" });
}

export async function getSystemAdminSession() {
  const token = (await cookies()).get(SYSTEM_COOKIE)?.value;
  if (!token) return null;
  const session = await db.systemAdminSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { admin: true } });
  if (!session || !session.admin.active || session.expiresAt <= new Date()) {
    if (session) await db.systemAdminSession.delete({ where: { id: session.id } });
    return null;
  }
  return { sessionId: session.id, admin: { id: session.admin.id, name: session.admin.name, username: session.admin.username } };
}

export async function destroySystemSession() {
  const store = await cookies();
  const token = store.get(SYSTEM_COOKIE)?.value;
  if (token) await db.systemAdminSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  store.delete(SYSTEM_COOKIE);
}
