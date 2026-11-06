import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const emailSchema = z.string().trim().max(254).email("Informe um e-mail válido.").transform(value => value.toLowerCase());
export const securityTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export type SecurityPurpose = "RESET_PASSWORD" | "VERIFY_EMAIL";
export const RESET_MESSAGE = "Se houver uma conta ativa com esse e-mail confirmado, enviaremos as instruções. Confira também a caixa de spam.";
export const INVALID_LINK = "Este link é inválido, expirou ou já foi utilizado. Solicite um novo link.";

export function hashSecurityToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newSecurityToken(purpose: SecurityPurpose, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSecurityToken(token), expiresAt: new Date(now.getTime() + (purpose === "RESET_PASSWORD" ? 30 * 60_000 : 24 * 60 * 60_000)) };
}

export function securityOrigin(value: string | undefined, production = process.env.NODE_ENV === "production") {
  if (!value) throw new Error("SECURITY_EMAIL_CONFIGURATION");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !( !production && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("SECURITY_EMAIL_CONFIGURATION");
  }
  return url.origin;
}

export function securityLink(origin: string, purpose: SecurityPurpose, token: string) {
  // Fragments never reach HTTP access logs or Referer headers.
  return `${origin}/${purpose === "RESET_PASSWORD" ? "redefinir-senha" : "confirmar-email"}#token=${token}`;
}

export function usableSecurityToken(
  token: { purpose: string; expiresAt: Date; consumedAt: Date | null; email: string; credentialHash: string },
  user: { active: boolean; email: string | null; emailVerifiedAt: Date | null; pendingEmail: string | null; passwordHash: string },
  purpose: SecurityPurpose,
  now = new Date(),
) {
  return token.purpose === purpose && !token.consumedAt && token.expiresAt > now && user.active &&
    token.credentialHash === hashSecurityToken(user.passwordHash) &&
    (purpose === "VERIFY_EMAIL" ? token.email === user.pendingEmail : Boolean(user.emailVerifiedAt && token.email === user.email));
}
