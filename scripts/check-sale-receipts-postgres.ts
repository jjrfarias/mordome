import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { queueSaleReceipts } from "../lib/receipt-print-jobs.ts";
const url = process.env.TEST_DATABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw Error("Local test database required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const base = process.env.TEST_APP_URL;
if (base && !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw Error("Local app required");
const suffix = randomUUID();
const org = await db.organization.create({ data: { name: "Receipt QA", slug: suffix } });
const user = await db.user.create({ data: { name: "QA", username: suffix, passwordHash: "disabled" } });
try {
  const store = await db.establishment.create({ data: { organizationId: org.id, name: "QA", slug: suffix } });
  const other = await db.establishment.create({ data: { organizationId: org.id, name: "Other", slug: suffix + "-other" } });
  const cutoff = new Date();
  const token = randomBytes(32).toString("hex");
  const agent = await db.kitchenPrintAgent.create({ data: { establishmentId: store.id, name: "QA", tokenHash: createHash("sha256").update(token).digest("hex"), receiptsActivatedAt: cutoff }, include: { establishment: true } });
  const create = (establishmentId: string, completedAt: Date, status: "COMPLETED" | "CANCELLED" = "COMPLETED") => db.sale.create({ data: { organizationId: org.id, establishmentId, operatorId: user.id, idempotencyKey: randomUUID(), channel: "POS", status, completedAt, subtotal: 50, total: 50, items: { create: { productName: "Pastel", quantity: 2, unitPrice: 25, total: 50 } }, payments: { create: { method: "PIX", amount: 50 } } } });
  await create(store.id, new Date(cutoff.getTime() - 1000));
  await create(store.id, cutoff, "CANCELLED");
  await create(other.id, cutoff);
  const sale = await create(store.id, cutoff);
  await queueSaleReceipts(db, { ...agent, receiptsActivatedAt: null });
  assert.equal(await db.kitchenPrintJob.count({ where: { agentId: agent.id } }), 0);
  await Promise.all(Array.from({ length: 8 }, () => queueSaleReceipts(db, agent)));
  const jobs = await db.kitchenPrintJob.findMany({ where: { agentId: agent.id } });
  assert.equal(jobs.length, 1); assert.equal(jobs[0].saleId, sale.id); assert.equal(jobs[0].orderId, null);
  if (base) {
    const request = (body?: object, key = token) => fetch(`${base}/api/integrations/kitchen-print`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await request(undefined, randomBytes(32).toString("hex"))).status, 401);
    const claims = await Promise.all(Array.from({ length: 8 }, () => request({ action: "CLAIM", jobId: jobs[0].id })));
    assert.equal(claims.filter(r => r.status === 200).length, 1);
    assert.equal(claims.filter(r => r.status === 409).length, 7);
    assert.equal((await request({ action: "ACK", jobId: jobs[0].id })).status, 200);
    assert.equal((await request({ action: "ACK", jobId: jobs[0].id })).status, 200);
    assert.equal((await request({ action: "CLAIM", jobId: jobs[0].id })).status, 409);
    const cancelled = await create(store.id, new Date());
    await queueSaleReceipts(db, agent);
    const pending = await db.kitchenPrintJob.findUniqueOrThrow({ where: { agentId_saleId: { agentId: agent.id, saleId: cancelled.id } } });
    await db.sale.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    assert.equal((await request({ action: "CLAIM", jobId: pending.id })).status, 409);
    assert.equal((await db.kitchenPrintJob.findUniqueOrThrow({ where: { id: pending.id } })).status, "REVIEW");
    assert.equal((await request({ action: "CLAIM", jobId: pending.id }, randomBytes(32).toString("hex"))).status, 401);
  }
  console.log("PASS: activation cutoff, opt-in, tenant isolation, 8 concurrent scans, unique receipt" + (base ? ", HTTP claims/ACK/retries/cancellation" : ""));
} finally {
  const stores = await db.establishment.findMany({ where: { organizationId: org.id }, select: { id: true } });
  await db.kitchenPrintAgent.deleteMany({ where: { establishmentId: { in: stores.map(s => s.id) } } });
  await db.sale.deleteMany({ where: { organizationId: org.id } });
  await db.establishment.deleteMany({ where: { organizationId: org.id } });
  await db.organization.delete({ where: { id: org.id } });
  await db.user.delete({ where: { id: user.id } });
  await db.$disconnect();
}
