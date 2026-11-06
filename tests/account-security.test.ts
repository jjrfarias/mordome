import test from "node:test";
import assert from "node:assert/strict";
import { emailSchema, hashSecurityToken, newSecurityToken, securityOrigin, securityLink, usableSecurityToken } from "../lib/account-security-policy.ts";

test("tokens criptográficos distintos, hash e validade por finalidade", () => {
  const now = new Date();
  const reset = newSecurityToken("RESET_PASSWORD", now);
  assert.match(reset.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(reset.tokenHash, hashSecurityToken(reset.token));
  assert.notEqual(reset.token, newSecurityToken("RESET_PASSWORD").token);
  assert.equal(reset.expiresAt.getTime() - now.getTime(), 30 * 60_000);
  assert.equal(newSecurityToken("VERIFY_EMAIL", now).expiresAt.getTime() - now.getTime(), 24 * 60 * 60_000);
});

test("e-mail normalizado sem remover pontos ou aliases", () => {
  assert.equal(emailSchema.parse("  Nome+alias@EXAMPLE.COM "), "nome+alias@example.com");
  assert.equal(emailSchema.safeParse("bad\nBcc: bad@example.com").success, false);
});

test("origem canônica impede links HTTP em produção e redirecionamentos", () => {
  assert.equal(securityOrigin("https://app.example.com", true), "https://app.example.com");
  for (const url of [undefined, "http://app.example.com", "https://user:pass@app.example.com", "https://app.example.com/path", "https://app.example.com?redirect=evil"]) assert.throws(() => securityOrigin(url, true));
  assert.equal(securityOrigin("http://localhost:3000", false), "http://localhost:3000");
  const link = new URL(securityLink("https://app.example.com", "RESET_PASSWORD", "secret"));
  assert.equal(link.search, ""); assert.equal(link.hash, "#token=secret");
});

test("token exige usuário ativo, mesma credencial, finalidade, destino e prazo", () => {
  const user = { active: true, email: "a@example.com", emailVerifiedAt: new Date(), pendingEmail: "b@example.com", passwordHash: "hash" };
  const token = { purpose: "RESET_PASSWORD", email: user.email, credentialHash: hashSecurityToken("hash"), consumedAt: null, expiresAt: new Date(Date.now() + 60_000) };
  assert.equal(usableSecurityToken(token, user, "RESET_PASSWORD"), true);
  assert.equal(usableSecurityToken(token, { ...user, emailVerifiedAt: null }, "RESET_PASSWORD"), false);
  assert.equal(usableSecurityToken(token, { ...user, email: "other@example.com" }, "RESET_PASSWORD"), false);
  assert.equal(usableSecurityToken(token, { ...user, active: false }, "RESET_PASSWORD"), false);
  assert.equal(usableSecurityToken(token, { ...user, passwordHash: "changed" }, "RESET_PASSWORD"), false);
  assert.equal(usableSecurityToken({ ...token, consumedAt: new Date() }, user, "RESET_PASSWORD"), false);
  assert.equal(usableSecurityToken({ ...token, expiresAt: new Date(0) }, user, "RESET_PASSWORD"), false);
  assert.equal(usableSecurityToken(token, user, "VERIFY_EMAIL"), false);
  assert.equal(usableSecurityToken({ ...token, purpose: "VERIFY_EMAIL", email: user.pendingEmail }, user, "VERIFY_EMAIL"), true);
  assert.equal(usableSecurityToken({ ...token, purpose: "VERIFY_EMAIL", email: "other@example.com" }, user, "VERIFY_EMAIL"), false);
});
