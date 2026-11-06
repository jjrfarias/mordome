import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { consumeAuthRate } from "@/lib/account-security-store";
import { securityOrigin } from "@/lib/account-security-policy";

export function securityResponse(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export function validSecurityOrigin(request: Request) {
  try {
    return request.headers.get("origin") === securityOrigin(process.env.AUTH_PUBLIC_URL);
  } catch { return false; }
}

export async function securityRate(request: Request, scope: string, identity?: string, limit = 5) {
  const secret = process.env.AUTH_RATE_SECRET;
  if (!secret || secret.length < 32) throw new Error("SECURITY_RATE_CONFIGURATION");
  const key = (value: string) => createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
  // IP is only an extra layer. Identity/global quotas also apply when proxy headers are spoofed.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 100) ?? "unknown";
  const allowedIp = await consumeAuthRate(db, key(`ip:${ip}`), 20, 15 * 60_000);
  if (!allowedIp) return false;
  const allowedGlobal = await consumeAuthRate(db, key("global"), 500, 15 * 60_000);
  if (!allowedGlobal) return false;
  return identity ? consumeAuthRate(db, key(`identity:${identity}`), limit, 15 * 60_000) : true;
}

export function securityFailure() {
  console.error(JSON.stringify({ event: "account_security_unavailable" }));
  return securityResponse({ error: "Serviço de segurança indisponível. Tente novamente mais tarde." }, 503);
}
