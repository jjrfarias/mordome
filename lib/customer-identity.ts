import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const customerPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return /^[1-9]{2}9\d{8}$/.test(national) ? `55${national}` : null;
};
export const sessionHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const newCustomerToken = () => randomBytes(32).toString("base64url");
export const newCustomerCode = () => String(randomInt(1000000)).padStart(6, "0");
export const customerCookie = (unit: string) => `mordome_customer_${sessionHash(unit).slice(0, 16)}`;
export function identityHash(value: string) {
  const secret = process.env.CUSTOMER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("CUSTOMER_AUTH_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function codeMatches(unit: string, challengeId: string, code: string, stored: string) {
  const actual = identityHash(`${unit}:${challengeId}:${code}`);
  return stored.length === actual.length && timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}
