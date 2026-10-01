import assert from "node:assert/strict";
import test from "node:test";

process.env.CUSTOMER_AUTH_SECRET = "customer-auth-test-secret-with-at-least-32-characters";
const { decryptWhatsAppSession, encryptWhatsAppSession } = await import("../lib/whatsapp-session.ts");

test("Baileys session archive is encrypted and bound to its establishment", () => {
  const encrypted = encryptWhatsAppSession("unit-a", { creds: { token: Buffer.from("secret") }, keys: { one: "two" } });
  assert.doesNotMatch(encrypted, /secret/);
  assert.deepEqual(decryptWhatsAppSession("unit-a", encrypted), { creds: { token: Buffer.from("secret") }, keys: { one: "two" } });
  assert.throws(() => decryptWhatsAppSession("unit-b", encrypted));
});
