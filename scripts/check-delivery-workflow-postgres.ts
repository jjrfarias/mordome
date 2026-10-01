import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.TEST_DATABASE_URL;
const base = process.env.TEST_APP_URL;
if (!connectionString || !base || ![connectionString, base].every(value => ["localhost", "127.0.0.1"].includes(new URL(value).hostname))) throw Error("Use isolated local TEST_DATABASE_URL and TEST_APP_URL");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const suffix = randomUUID();
  const org = await db.organization.create({ data: { name: "Workflow QA", slug: suffix } });
  const store = await db.establishment.create({ data: { organizationId: org.id, name: "Workflow QA", slug: suffix } });
  const user = await db.user.create({ data: { name: "QA", username: suffix, passwordHash: "not-a-login-hash" } });
  const permissions = await Promise.all(["pos.sell", "floor.operate", "delivery.operate"].map(key => db.permission.upsert({ where: { key }, update: {}, create: { key, module: "qa", description: "QA" } })));
  const role = await db.customRole.create({ data: { organizationId: org.id, name: "QA", permissions: { create: permissions.map(permission => ({ permissionId: permission.id })) } } });
  await db.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, status: "ACTIVE", accesses: { create: { establishmentId: store.id } }, roles: { create: { roleId: role.id } } } });
  const token = randomUUID();
  await db.session.create({ data: { userId: user.id, activeEstablishmentId: store.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  await db.cashSession.create({ data: { establishmentId: store.id, openedById: user.id, openingAmount: 0 } });
  const product = await db.product.create({ data: { organizationId: org.id, name: "QA", slug: suffix, variants: { create: { name: "Default", isDefault: true, offerings: { create: { establishmentId: store.id, channel: "DELIVERY", price: 6 } } } } } });
  async function request(path: string, data?: object, expected: number | number[] = 200) {
    const response = await fetch(new URL(path, base), { method: data ? "POST" : "GET", headers: { "content-type": "application/json", origin: base!, cookie: `mordome_session=${token}` }, body: data ? JSON.stringify(data) : undefined });
    const result = await response.json();
    assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), JSON.stringify({ status: response.status, result }));
    return result;
  }
  async function create() {
    const result = await request(`/api/public/orders/${store.id}`, { clientRequestId: randomUUID(), customerName: "QA", customerPhone: "22999990000", address: "Test 100", items: [{ productId: product.id, quantity: 1 }] }, 201);
    return (await db.deliveryOrder.findUniqueOrThrow({ where: { id: result.orderId } }));
  }
  const delivery = await create();
  const stage = (status: string, expected = 200) => request("/api/operations/delivery", { action: "CHANGE_STATUS", orderId: delivery.id, status }, expected);
  const kitchen = (orderId: string, status: string, expected = 200) => request("/api/operations/floor", { action: "CHANGE_ORDER_STATUS", orderId, status }, expected);
  const sale = () => ({ action: "COMPLETE", channel: "DELIVERY", deliveryOrderId: delivery.id, items: [{ productId: product.id, quantity: 1 }], payments: [{ method: "PIX", amount: 6 }], idempotencyKey: randomUUID() });
  await request("/api/operations/sales", sale(), 409);
  await request("/api/operations/delivery", { action: "ASSIGN_COURIER", orderId: delivery.id, courierId: user.id });
  await kitchen(delivery.kitchenOrderId!, "PREPARING");
  assert.equal((await db.deliveryOrder.findUniqueOrThrow({ where: { id: delivery.id } })).status, "PREPARING");
  await stage("OUT_FOR_DELIVERY", 409);
  await request("/api/operations/sales", sale(), 409);
  await kitchen(delivery.kitchenOrderId!, "READY");
  await kitchen(delivery.kitchenOrderId!, "DELIVERED", 409);
  await stage("OUT_FOR_DELIVERY");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: delivery.kitchenOrderId! } })).status, "DELIVERED");
  await request("/api/operations/sales", sale(), 201);
  assert.equal((await db.deliveryOrder.findUniqueOrThrow({ where: { id: delivery.id } })).status, "DELIVERED");
  // Reproduce the original paid-tab orphan, preserving the real recorded sale.
  await db.order.update({ where: { id: delivery.kitchenOrderId! }, data: { status: "READY" } });
  await kitchen(delivery.kitchenOrderId!, "DELIVERED");
  assert.equal((await request("/api/operations/floor")).orders.some((order: { id: string }) => order.id === delivery.kitchenOrderId), false);
  const cancelled = await create();
  await Promise.all([
    request("/api/operations/delivery", { action: "CHANGE_STATUS", orderId: cancelled.id, status: "CANCELLED" }, [200, 409]),
    request("/api/operations/floor", { action: "CHANGE_ORDER_STATUS", orderId: cancelled.kitchenOrderId, status: "PREPARING" }, [200, 409]),
  ]);
  if ((await db.deliveryOrder.findUniqueOrThrow({ where: { id: cancelled.id } })).status !== "CANCELLED") await request("/api/operations/delivery", { action: "CHANGE_STATUS", orderId: cancelled.id, status: "CANCELLED" });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: cancelled.kitchenOrderId! } })).status, "CANCELLED");
  const other = await db.establishment.create({ data: { organizationId: org.id, name: "Other", slug: `${suffix}-other` } });
  const table = await db.diningTable.create({ data: { establishmentId: other.id, number: 0, isCounter: true } });
  const tab = await db.tab.create({ data: { establishmentId: other.id, tableId: table.id, openedById: user.id } });
  const otherOrder = await db.order.create({ data: { tabId: tab.id, sentById: user.id } });
  await kitchen(otherOrder.id, "PREPARING", 404);
  if (process.env.TEST_UI_FIXTURE) {
    const pending = await create();
    await request("/api/operations/delivery", { action: "ASSIGN_COURIER", orderId: pending.id, courierId: user.id });
    await db.order.update({ where: { id: delivery.kitchenOrderId! }, data: { status: "READY" } });
    await writeFile(process.env.TEST_UI_FIXTURE, JSON.stringify({ base, token, pendingId: pending.id, kitchenId: pending.kitchenOrderId }));
  }
  console.log("PASS: preparation sync, early dispatch/payment rejected, handoff, payment, paid-tab recovery, cancellation and tenant isolation");
} finally { await db.$disconnect(); }
