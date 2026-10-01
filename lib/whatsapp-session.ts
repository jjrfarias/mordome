import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { BufferJSON } from "@whiskeysockets/baileys";

function encryptionKey() {
  const secret = process.env.CUSTOMER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw Error("CUSTOMER_AUTH_NOT_CONFIGURED");
  return createHash("sha256").update(`mordome:whatsapp-auth:v1:${secret}`).digest();
}

export function encryptWhatsAppSession(unit: string, value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(unit));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value, BufferJSON.replacer)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptWhatsAppSession<T>(unit: string, value: string): T {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 29) throw Error("INVALID_WHATSAPP_SESSION");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(unit)); decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"), BufferJSON.reviver) as T;
}
