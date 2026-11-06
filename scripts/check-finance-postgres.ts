import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { businessDay, addDays } from "../lib/finance-ledger.ts";

const url = process.env.TEST_DATABASE_URL;
const base = process.env.TEST_APP_URL ?? "http://127.0.0.1:3022";
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith("_test") || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use somente aplicação e banco local isolado terminado em _test.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const orgs: string[] = [], users: string[] = [];
const token = randomBytes(32).toString("base64url"), stamp = randomUUID();
const today = businessDay();
async function request(path: string, method = "GET", body?: object, authenticated = true) {
  const response = await fetch(base + path, { method, headers: { Origin: base, "Content-Type": "application/json", ...(authenticated ? { Cookie: `mordome_session=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
try {
  const organization = await db.organization.create({ data: { name: "Finance QA", slug: `finance-${stamp}` } }); orgs.push(organization.id);
  const otherOrg = await db.organization.create({ data: { name: "Other Finance QA", slug: `finance-other-${stamp}` } }); orgs.push(otherOrg.id);
  const unit = await db.establishment.create({ data: { organizationId: organization.id, name: "Finance QA", slug: `finance-${stamp}` } });
  const otherUnit = await db.establishment.create({ data: { organizationId: otherOrg.id, name: "Other", slug: `other-${stamp}` } });
  const sibling = await db.establishment.create({ data: { organizationId: organization.id, name: "Sibling", slug: `sibling-${stamp}` } });
  const user = await db.user.create({ data: { username: `finance-${stamp}`, name: "Finance QA", passwordHash: "not-a-login-credential" } }); users.push(user.id);
  const permissions = await db.permission.findMany({ where: { key: { in: ["finance.manage", "finance.entries.manage", "finance.cashflow.view"] } } }); assert.equal(permissions.length, 3);
  const role = await db.customRole.create({ data: { organizationId: organization.id, name: "Finance QA", permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } });
  await db.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, status: "ACTIVE", accesses: { create: { establishmentId: unit.id } }, roles: { create: { roleId: role.id } } } });
  await db.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000), activeEstablishmentId: unit.id } });
  const expense = await db.financialCategory.create({ data: { organizationId: organization.id, name: "Expense QA", kind: "EXPENSE" } });
  const income = await db.financialCategory.create({ data: { organizationId: organization.id, name: "Income QA", kind: "INCOME" } });
  const otherCategory = await db.financialCategory.create({ data: { organizationId: otherOrg.id, name: "Other QA", kind: "INCOME" } });
  const foreignAccount = await db.bankAccount.create({ data: { establishmentId: otherUnit.id, name: "Other", bank: "Test" } });
  const siblingAccount = await db.bankAccount.create({ data: { establishmentId: sibling.id, name: "Sibling", bank: "Test" } });
  const bankResult = await request("/api/admin/finance/bank-accounts", "POST", { name: "Main", bank: "Test", initialBalance: "1000.10", balanceAsOf: addDays(today, -30) }); assert.equal(bankResult.status, 201);
  const accountId = bankResult.data.account.id;
  assert.equal((await request("/api/admin/finance/overview", "GET", undefined, false)).status, 403);
  const input = { description: "Conta QA", categoryId: expense.id, bankAccountId: accountId, amount: "100.05", dueDate: today, idempotencyKey: randomUUID() };
  const concurrent = await Promise.all([request("/api/admin/finance/entries", "POST", input), request("/api/admin/finance/entries", "POST", input)]);
  assert.ok(concurrent.every(r => r.status === 201), JSON.stringify(concurrent)); assert.equal(concurrent[0].data.entry.id, concurrent[1].data.entry.id);
  const entryId = concurrent[0].data.entry.id;
  assert.equal(await db.financialEntry.count({ where: { idempotencyKey: input.idempotencyKey } }), 1);
  assert.equal((await request("/api/admin/finance/entries", "POST", { ...input, amount: "200.00" })).status, 409);
  for (const invalid of [{ bankAccountId: foreignAccount.id }, { bankAccountId: siblingAccount.id }, { categoryId: otherCategory.id }]) {
    assert.equal((await request("/api/admin/finance/entries", "POST", { ...input, ...invalid, idempotencyKey: randomUUID() })).status, 409);
    assert.equal((await request("/api/admin/finance/entries", "PATCH", { entryId, ...invalid })).status, 409);
  }
  assert.equal((await request(`/api/admin/finance/overview?accountId=${foreignAccount.id}`)).status, 404);
  assert.equal((await request("/api/admin/finance/entries", "PATCH", { entryId, status: "PAID" })).status, 409);
  assert.equal((await request("/api/admin/finance/entries", "PATCH", { entryId, status: "PAID", paidDate: addDays(today, 1) })).status, 400);
  const settle = { entryId, status: "PAID", bankAccountId: accountId, paidDate: today };
  assert.equal((await request("/api/admin/finance/entries", "PATCH", settle)).status, 200);
  assert.equal((await request("/api/admin/finance/entries", "PATCH", settle)).status, 200);
  let overview = await request("/api/admin/finance/overview?days=7"); assert.equal(overview.data.balanceCents, 90005); assert.equal(overview.data.expenseCents, 0);
  await request("/api/admin/finance/entries", "POST", { ...input, categoryId: income.id, amount: "50.20", dueDate: addDays(today, 1), idempotencyKey: randomUUID() });
  await request("/api/admin/finance/entries", "POST", { ...input, categoryId: income.id, amount: "90.00", dueDate: addDays(today, -1), idempotencyKey: randomUUID() });
  overview = await request("/api/admin/finance/overview?days=7"); assert.equal(overview.data.projectedBalanceCents, 95025); assert.equal(overview.data.overdueIncomeCents, 9000);
  assert.equal((await request("/api/admin/finance/categories", "PATCH", { categoryId: expense.id, kind: "INCOME" })).status, 409);
  await assert.rejects(db.financialCategory.update({ where: { id: expense.id }, data: { kind: "INCOME" } }));
  assert.equal((await request("/api/admin/finance/reconciliation", "PATCH", { entryId, reconciled: true })).status, 200);
  assert.equal((await request("/api/admin/finance/entries", "PATCH", { entryId, status: "PENDING" })).status, 409);
  assert.equal((await request("/api/admin/finance/reconciliation", "PATCH", { entryId, reconciled: false })).status, 200);
  assert.equal((await request("/api/admin/finance/entries", "PATCH", { entryId, status: "PENDING" })).status, 200);
  overview = await request("/api/admin/finance/overview?days=7"); assert.equal(overview.data.balanceCents, 100010); assert.equal(overview.data.projectedBalanceCents, 95025);
  assert.equal((await request("/api/admin/finance/reconciliation", "PATCH", { entryId, reconciled: true })).status, 409);
  await db.rolePermission.deleteMany({ where: { roleId: role.id } });
  assert.equal((await request("/api/admin/finance/overview")).status, 403);
  assert.equal((await request("/api/admin/finance/entries", "POST", input)).status, 403);
  assert.ok(await db.auditEvent.count({ where: { organizationId: organization.id, entityId: entryId } }));
  console.log("PASS: centavos, saldo, previsto/realizado, vencidos, baixa/reabertura, idempotência concorrente, conciliação, categoria imutável, autorização e isolamento entre empresas/unidades.");
} finally {
  await db.financialEntry.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.auditEvent.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
