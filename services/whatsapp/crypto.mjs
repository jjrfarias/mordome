import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
export function encryptionKey() {
  const key = Buffer.from(process.env.WHATSAPP_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw Error('WHATSAPP_ENCRYPTION_KEY must be 32 random bytes in base64');
  return key;
}
export function seal(unit, value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(unit));
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function unseal(unit, value) {
  const bytes = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(unit)); decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
}
export function authorized(header, secret) {
  if (!secret || secret.length < 32 || typeof header !== 'string') return false;
  const actual = Buffer.from(header), expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
