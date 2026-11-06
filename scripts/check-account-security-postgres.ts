import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { consumeAccountToken, consumeAuthRate, issueAccountToken } from "../lib/account-security-store.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";

const url = process.env.TEST_DATABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith("_test")) throw new Error("Use TEST_DATABASE_URL de um banco local isolado terminado em _test.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const prefix = randomUUID();
const users: string[] = [];
const rates: string[] = [];
let invitationOrg: string | undefined;
try {
  const passwordHash = await hashPassword("Original123");
  const a = await db.user.create({ data: { username: `a-${prefix}`, name: "Security test A", passwordHash } }); users.push(a.id);
  const b = await db.user.create({ data: { username: `b-${prefix}`, name: "Security test B", passwordHash } }); users.push(b.id);
  const email = `a-${prefix}@example.com`;
  assert.equal(await issueAccountToken(db, a.id, "RESET_PASSWORD", email), null);
  assert.equal(await issueAccountToken(db, a.id, "VERIFY_EMAIL", email, "wrong-credential"), null);
  const first = await issueAccountToken(db, a.id, "VERIFY_EMAIL", email, passwordHash); assert.ok(first);
  const second = await issueAccountToken(db, a.id, "VERIFY_EMAIL", email, passwordHash); assert.ok(second);
  assert.equal(await consumeAccountToken(db, first.token, "VERIFY_EMAIL"), null);
  assert.equal(await consumeAccountToken(db, second.token, "RESET_PASSWORD", passwordHash), null);
  const verified = await consumeAccountToken(db, second.token, "VERIFY_EMAIL"); assert.ok(verified);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: a.id } })).email, email);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: b.id } })).email, null);
  assert.equal(await consumeAccountToken(db, second.token, "VERIFY_EMAIL"), null);
  const duplicate = await issueAccountToken(db, b.id, "VERIFY_EMAIL", email, passwordHash); assert.ok(duplicate);
  await assert.rejects(consumeAccountToken(db, duplicate.token, "VERIFY_EMAIL"), { code: "P2002" });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: b.id } })).email, null);

  const reset = await issueAccountToken(db, a.id, "RESET_PASSWORD", email); assert.ok(reset);
  await db.session.createMany({ data: [a.id, a.id, b.id].map(userId => ({ userId, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) })) });
  const changedHash = await hashPassword("Changed456");
  const results = await Promise.all(Array.from({ length: 5 }, () => consumeAccountToken(db, reset.token, "RESET_PASSWORD", changedHash)));
  assert.equal(results.filter(Boolean).length, 1, "somente um reset concorrente pode vencer");
  assert.equal(await db.session.count({ where: { userId: a.id } }), 0);
  assert.equal(await db.session.count({ where: { userId: b.id } }), 1, "não revoga sessões de outra conta");
  assert.equal(await verifyPassword("Changed456", (await db.user.findUniqueOrThrow({ where: { id: a.id } })).passwordHash), true);

  const expired = await issueAccountToken(db, a.id, "RESET_PASSWORD", email); assert.ok(expired);
  await db.accountSecurityToken.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
  assert.equal(await consumeAccountToken(db, expired.token, "RESET_PASSWORD", passwordHash), null);
  const stale = await issueAccountToken(db, a.id, "RESET_PASSWORD", email); assert.ok(stale);
  await db.user.update({ where: { id: a.id }, data: { passwordHash } });
  assert.equal(await consumeAccountToken(db, stale.token, "RESET_PASSWORD", changedHash), null);

  const beforeChange = await issueAccountToken(db, a.id, "RESET_PASSWORD", email); assert.ok(beforeChange);
  const newEmail = `changed-${prefix}@example.com`;
  const change = await issueAccountToken(db, a.id, "VERIFY_EMAIL", newEmail, passwordHash); assert.ok(change);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: a.id } })).email, email, "mantém endereço confirmado até concluir troca");
  assert.ok(await consumeAccountToken(db, change.token, "VERIFY_EMAIL"));
  assert.equal(await consumeAccountToken(db, beforeChange.token, "RESET_PASSWORD", changedHash), null);
  const disabled = await issueAccountToken(db, a.id, "RESET_PASSWORD", newEmail); assert.ok(disabled);
  await db.user.update({ where: { id: a.id }, data: { active: false } });
  assert.equal(await consumeAccountToken(db, disabled.token, "RESET_PASSWORD", changedHash), null);

  const invited = await db.user.create({ data: { username: `invite-${prefix}`, name: "Invite test", passwordHash, pendingEmail: `invite-${prefix}@example.com` } }); users.push(invited.id);
  const organization = await db.organization.create({ data: { name: "Invitation test", slug: `invite-${prefix}` } }); invitationOrg = organization.id;
  const membership = await db.organizationMembership.create({ data: { userId: invited.id, organizationId: organization.id, status: "INVITED" } });
  const invite = await issueAccountToken(db, invited.id, "ACCEPT_INVITE", invited.pendingEmail!); assert.ok(invite);
  assert.equal(await consumeAccountToken(db, invite.token, "VERIFY_EMAIL"), null);
  assert.equal(await consumeAccountToken(db, invite.token, "RESET_PASSWORD", changedHash), null);
  assert.equal(await consumeAccountToken(db, invite.token, "ACCEPT_INVITE"), null);
  const renewed = await issueAccountToken(db, invited.id, "ACCEPT_INVITE", invited.pendingEmail!); assert.ok(renewed);
  assert.equal(await consumeAccountToken(db, invite.token, "ACCEPT_INVITE", changedHash), null);
  await db.organizationMembership.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
  assert.equal(await consumeAccountToken(db, renewed.token, "ACCEPT_INVITE", changedHash), null);
  await db.organizationMembership.update({ where: { id: membership.id }, data: { status: "INVITED" } });
  const acceptance = await Promise.all(Array.from({ length: 4 }, () => consumeAccountToken(db, renewed.token, "ACCEPT_INVITE", changedHash)));
  assert.equal(acceptance.filter(Boolean).length, 1);
  const accepted = await db.user.findUniqueOrThrow({ where: { id: invited.id } });
  assert.equal(accepted.email, invited.pendingEmail); assert.ok(accepted.emailVerifiedAt); assert.equal(accepted.pendingEmail, null);
  assert.equal(await verifyPassword("Changed456", accepted.passwordHash), true);
  assert.equal((await db.organizationMembership.findUniqueOrThrow({ where: { id: membership.id } })).status, "ACTIVE");
  assert.equal(await issueAccountToken(db, invited.id, "ACCEPT_INVITE", accepted.email!), null);
  assert.ok(await db.accountSecurityEvent.count({ where: { userId: invited.id, action: "INVITATION_ACCEPTED" } }));

  const rateKey = `test-${prefix}`; rates.push(rateKey);
  const allowed = await Promise.all(Array.from({ length: 20 }, () => consumeAuthRate(db, rateKey, 3, 60_000)));
  assert.equal(allowed.filter(Boolean).length, 3, "limite atômico entre requisições concorrentes");
  await db.authRateBucket.update({ where: { key: rateKey }, data: { expiresAt: new Date(0) } });
  assert.equal(await consumeAuthRate(db, rateKey, 3, 60_000), true);
  assert.ok(await db.accountSecurityEvent.count({ where: { userId: a.id, action: "PASSWORD_RESET_COMPLETED" } }));
  console.log("PASS: confirmação, troca, expiração, finalidade, revogação, isolamento de contas, duplicidade, concorrência e rate limit no PostgreSQL.");
} finally {
  if (invitationOrg) {
    await db.organizationMembership.deleteMany({ where: { organizationId: invitationOrg } });
    await db.organization.delete({ where: { id: invitationOrg } });
  }
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.authRateBucket.deleteMany({ where: { key: { in: rates } } });
  await db.$disconnect();
}
