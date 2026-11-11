import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";
import { tvDisplayTokenHash, TvError, type TvAdminScope } from "@/lib/tv-server";

export async function instagramSessionHash() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new TvError("Entre no Mordomê novamente para conectar o Instagram.", 401);
  return tvDisplayTokenHash(token);
}
export async function pendingInstagramAuthorization(scope: TvAdminScope) {
  return db.tvInstagramAuthorization.findFirst({ where: { establishmentId: scope.establishmentId, organizationId: scope.organizationId, actorId: scope.actorId, sessionHash: await instagramSessionHash(), expiresAt: { gt: new Date() }, callbackUsed: true, encryptedToken: { not: null } } });
}
export function instagramAccounts(value: unknown): { id: string; username: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { id: string; username: string } => !!item && typeof item === "object" && "id" in item && typeof item.id === "string" && /^\d{5,30}$/.test(item.id) && "username" in item && typeof item.username === "string");
}
