import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { businessDay, addDays } from "../lib/finance-ledger.ts";

const url = process.env.TEST_DATABASE_URL, base = process.env.TEST_APP_URL ?? "http://127.0.0.1:3022";
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith("_test") || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use somente aplicação e banco local isolado terminado em _test.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const orgs: string[] = [], users: string[] = [], stamp = randomUUID(), token = randomBytes(32).toString("base64url"), today = businessDay();
const endpoint = "/api/admin/finance/daily-receipts";
async function request(path: string, method = "GET", body?: object, authenticated = true) {
  const response = await fetch(base + path, { method, headers: { Origin: base, "Content-Type": "application/json", ...(authenticated ? { Cookie: `mordome_session=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
try {
  const org = await db.organization.create({ data: { name: "Recebimentos QA", slug: `receipts-${stamp}` } }); orgs.push(org.id);
  const foreign = await db.organization.create({ data: { name: "Outra empresa QA", slug: `other-receipts-${stamp}` } }); orgs.push(foreign.id);
  const unit = await db.establishment.create({ data: { organizationId: org.id, name: "Recebimentos QA", slug: `receipts-${stamp}` } });
  const sibling = await db.establishment.create({ data: { organizationId: org.id, name: "Outra unidade QA", slug: `sibling-${stamp}` } });
  const foreignUnit = await db.establishment.create({ data: { organizationId: foreign.id, name: "Outra empresa", slug: `foreign-${stamp}` } });
  const user = await db.user.create({ data: { username: `receipts-${stamp}`, name: "Recebimentos QA", passwordHash: "not-a-login-credential" } }); users.push(user.id);
  const permissions = await db.permission.findMany({ where: { key: { in: ["finance.entries.manage", "finance.cashflow.view", "pos.cancel_sale"] } } }); assert.equal(permissions.length, 3);
  const role = await db.customRole.create({ data: { organizationId: org.id, name: "Conferência QA", permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } });
  await db.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, status: "ACTIVE", accesses: { create: { establishmentId: unit.id } }, roles: { create: { roleId: role.id } } } });
  await db.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000), activeEstablishmentId: unit.id } });
  const bank = await db.bankAccount.create({ data: { establishmentId: unit.id, name: "Ton QA", bank: "Teste", initialBalance: "0", balanceAsOf: new Date(addDays(today, -30)) } });
  const bank2 = await db.bankAccount.create({ data: { establishmentId: unit.id, name: "Segunda conta", bank: "Teste", initialBalance: "0", balanceAsOf: new Date(addDays(today, -30)) } });
  const otherBank = await db.bankAccount.create({ data: { establishmentId: foreignUnit.id, name: "Fora", bank: "Teste" } });
  const income = await db.financialCategory.create({ data: { organizationId: org.id, name: "Receitas QA", kind: "INCOME" } });
  const expense = await db.financialCategory.create({ data: { organizationId: org.id, name: "Despesas QA", kind: "EXPENSE" } });
  const make = (amount: string, extra: object = {}) => db.financialEntry.create({ data: { organizationId: org.id, establishmentId: unit.id, categoryId: income.id, createdById: user.id, bankAccountId: bank.id, description: `Recebimento QA ${amount}`, amount, dueDate: new Date(today), ...extra } });
  const payload = (entries: { id: string; updatedAt: Date }[], amount: string, extra: object = {}) => ({ idempotencyKey: randomUUID(), entries: entries.map(e => ({ id: e.id, updatedAt: e.updatedAt.toISOString() })), bankAccountId: bank.id, receivedDate: today, receivedAmount: amount, ...extra });
  const balance = async () => (await request("/api/admin/finance/overview")).data.balanceCents;
  assert.equal((await request(endpoint, "GET", undefined, false)).status, 403);
  const a = await make("100.01"), b = await make("50.02");
  const input = payload([a, b], "149.00", { reason: "Desconto adicional no extrato" });
  const same = await Promise.all([request(endpoint, "POST", input), request(endpoint, "POST", input)]);
  assert.ok(same.every(r => r.status === 200), JSON.stringify(same));
  assert.equal(same[0].data.batch.id, same[1].data.batch.id);
  const batch = same[0].data.batch;
  assert.equal(batch.expectedAmount, "150.03"); assert.equal(batch.differenceAmount, "-1.03");
  assert.equal(await balance(), 14900);
  assert.equal(await db.financialEntry.count({ where: { receiptBatchId: batch.id, isReceiptBatchAdjustment: true, category: { kind: "EXPENSE" } } }), 1);
  assert.equal((await request(endpoint, "POST", { ...input, receivedAmount: "148.00" })).status, 409);
  assert.equal((await request("/api/admin/finance/entries", "PATCH", { entryId: a.id, status: "PENDING" })).status, 409);
  assert.equal((await request("/api/admin/finance/reconciliation", "PATCH", { entryId: a.id, reconciled: false })).status, 409);
  let daily = await request(endpoint); assert.equal(daily.status, 200); assert.equal(daily.data.receivedCents, 14900); assert.equal(daily.data.differenceCents, -103);
  assert.equal(daily.data.batches[0].items.length, 2);
  const undo = { batchId: batch.id, reason: "Conferência refeita" };
  assert.equal((await request(endpoint, "PATCH", undo)).status, 200);
  assert.equal((await request(endpoint, "PATCH", undo)).status, 200);
  assert.equal(await balance(), 0);
  assert.equal((await db.financialEntry.findUniqueOrThrow({ where: { id: a.id } })).status, "PENDING");
  assert.equal(await db.auditEvent.count({ where: { entityId: batch.id, organizationId: org.id } }), 2);
  assert.equal((await request(endpoint, "POST", input)).data.batch.status, "REVERSED"); assert.equal(await balance(), 0);

  const c = await make("90.00", { status: "PAID", paidAt: new Date(`${addDays(today, -1)}T18:00:00Z`) });
  const d = await make("10.00", { bankAccountId: null });
  assert.equal(await balance(), 9000);
  const positive = await request(endpoint, "POST", payload([c, d], "102.00", { reason: "Crédito extra no depósito" }));
  assert.equal(positive.status, 200, JSON.stringify(positive)); assert.equal(await balance(), 10200);
  assert.equal((await request(endpoint)).data.receivedCents, 10200);
  assert.equal((await request(endpoint, "PATCH", { batchId: positive.data.batch.id, reason: "Refazer" })).status, 200);
  assert.equal(await balance(), 9000);
  const restored = await db.financialEntry.findUniqueOrThrow({ where: { id: c.id } }); assert.equal(restored.paidAt?.toISOString(), c.paidAt?.toISOString());
  assert.equal((await db.financialEntry.findUniqueOrThrow({ where: { id: d.id } })).bankAccountId, null);

  const available = await make("20.00");
  const wrongBank = await make("3.00", { bankAccountId: bank2.id });
  const wrongUnit = await make("3.00", { establishmentId: sibling.id, bankAccountId: null });
  const wrongKind = await make("3.00", { categoryId: expense.id });
  const reconciled = await make("3.00", { reconciled: true, status: "PAID", paidAt: new Date(`${today}T15:00:00Z`) });
  const voided = await make("3.00", { voidedAt: new Date() });
  for (const invalid of [wrongBank, wrongUnit, wrongKind, reconciled, voided]) {
    const response = await request(endpoint, "POST", payload([available, invalid], "23.00")); assert.equal(response.status, 409, JSON.stringify(response));
    assert.equal((await db.financialEntry.findUniqueOrThrow({ where: { id: available.id } })).status, "PENDING");
  }
  for (const extra of [{ bankAccountId: otherBank.id }, { receivedDate: addDays(today, 1) }, { receivedAmount: "19.00" }]) assert.equal((await request(endpoint, "POST", payload([available], "20.00", extra))).status, 409);
  assert.equal((await request(endpoint, "POST", payload([available, available], "40.00"))).status, 409);
  await db.financialEntry.update({ where: { id: available.id }, data: { notes: "Alterado durante conferência" } });
  assert.equal((await request(endpoint, "POST", payload([available], "20.00"))).status, 409);
  const fresh = await db.financialEntry.findUniqueOrThrow({ where: { id: available.id } });
  const concurrent = await Promise.all([request(endpoint, "POST", payload([fresh], "20.00")), request(endpoint, "POST", payload([fresh], "20.00"))]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  const exact = concurrent.find(r => r.status === 200)!.data.batch;
  assert.equal(await db.financialEntry.count({ where: { receiptBatchId: exact.id, isReceiptBatchAdjustment: true } }), 0);
  // Date boundary: 02:59 UTC belongs to the previous Brazilian business day.
  const midnight = await make("7.00", { status: "PAID", paidAt: new Date(`${today}T02:59:00Z`) });
  daily = await request(endpoint); assert.ok(!daily.data.entries.some((e: { id: string }) => e.id === midnight.id));
  const late = await make("8.00", { dueDate: new Date(addDays(today, -2)) });
  assert.ok((await request(endpoint)).data.entries.some((e: { id: string }) => e.id === late.id));
  assert.ok(!(await request(`${endpoint}?overdue=false`)).data.entries.some((e: { id: string }) => e.id === late.id));
  assert.equal((await request(endpoint, "PATCH", { batchId: exact.id, reason: "" })).status, 400);
  const cash = await db.cashSession.create({ data: { establishmentId: unit.id, openedById: user.id, openingAmount: "0" } });
  const sale = await db.sale.create({ data: { organizationId: org.id, establishmentId: unit.id, operatorId: user.id, cashSessionId: cash.id, idempotencyKey: randomUUID(), channel: "DELIVERY", subtotal: "100", total: "100", financeTracked: true, payments: { create: { method: "CREDIT_CARD", amount: "100" } } }, include: { payments: true } });
  const card = await make("97.01", { sourcePaymentId: sale.payments[0].id, grossAmount: "100", feeAmount: "2.99", feeRateSnapshot: "2.99", sourceLabel: "Ton QA" });
  const cardBatch = await request(endpoint, "POST", payload([card], "96.00", { reason: "Diferença da adquirente" })); assert.equal(cardBatch.status, 200, JSON.stringify(cardBatch));
  assert.equal((await db.financialEntry.findUniqueOrThrow({ where: { id: card.id } })).amount.toString(), "97.01");
  const cancelled = await request("/api/operations/sales", "POST", { action: "CANCEL", saleId: sale.id, reason: "Cancelamento após conciliação", idempotencyKey: randomUUID() }); assert.equal(cancelled.status, 200, JSON.stringify(cancelled));
  assert.equal((await request(endpoint, "PATCH", { batchId: cardBatch.data.batch.id, reason: "Não deve reabrir venda cancelada" })).status, 409);
  assert.equal(await db.financialEntry.count({ where: { reversalOfId: card.id } }), 1);
  daily = await request(endpoint); assert.ok(daily.data.entries.some((e: { id: string }) => e.id === card.id));
  assert.equal(daily.data.receivedCents, 11900); // 20 exact + 3 already reconciled + 96 card deposit, even after cancellation (reversal is an expense).
  await db.rolePermission.deleteMany({ where: { roleId: role.id } });
  assert.equal((await request(endpoint)).status, 403); assert.equal((await request(endpoint, "PATCH", undo)).status, 403);
  console.log("PASS: baixa e conciliação atômicas; diferenças positivas/negativas; saldo sem duplicação; idempotência e concorrência; restauração de datas/contas; histórico/auditoria; proteção individual; validação de datas/versões/contas; isolamento e permissões.");
} finally {
  await db.receiptBatchItem.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.financialEntry.deleteMany({ where: { organizationId: { in: orgs }, reversalOfId: { not: null } } });
  await db.financialEntry.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.receiptBatch.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.sale.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.cashSession.deleteMany({ where: { establishment: { organizationId: { in: orgs } } } });
  await db.auditEvent.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
