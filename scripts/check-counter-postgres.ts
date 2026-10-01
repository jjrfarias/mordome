import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { getCounterTable } from "../lib/counter-table";

// Run against an isolated, migrated database; never defaults to DATABASE_URL.
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || !["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname)) {
  throw new Error("TEST_DATABASE_URL must point to an isolated local PostgreSQL database");
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const suffix = randomUUID();
try {
  const organization = await db.organization.create({ data: { name: "Counter regression", slug: suffix } });
  const store = await db.establishment.create({ data: { organizationId: organization.id, name: "Test", slug: suffix } });
  const other = await db.establishment.create({ data: { organizationId: organization.id, name: "Other", slug: `${suffix}-other` } });
  const user = await db.user.create({ data: { name: "Test", username: suffix, passwordHash: "not-a-login-hash" } });
  const tabs = await Promise.all(Array.from({ length: 4 }, () => db.$transaction(async tx => {
    const table = await getCounterTable(tx, store.id);
    return tx.tab.create({ data: { establishmentId: store.id, tableId: table.id, openedById: user.id } });
  })));
  assert.equal(new Set(tabs.map(tab => tab.tableId)).size, 1);
  assert.equal(new Set(tabs.map(tab => tab.id)).size, 4);
  assert.ok(tabs.every(tab => tab.isCounter && tab.status === "OPEN"));
  const seated = await db.diningTable.create({ data: { establishmentId: store.id, number: 1, seats: 2 } });
  const seatedTab = await db.tab.create({ data: { establishmentId: store.id, tableId: seated.id, openedById: user.id, isCounter: true } });
  assert.equal(seatedTab.isCounter, false);
  await assert.rejects(db.tab.create({ data: { establishmentId: store.id, tableId: seated.id, openedById: user.id, isCounter: true } }), { code: "P2002" });
  await assert.rejects(db.tab.create({ data: { establishmentId: other.id, tableId: tabs[0].tableId, openedById: user.id } }), { code: "P2003" });
  await assert.rejects(db.diningTable.update({ where: { id: tabs[0].tableId }, data: { isCounter: false } }), { code: "P2002" });
  const protectedTab = await db.tab.update({ where: { id: tabs[0].id }, data: { isCounter: false } });
  assert.equal(protectedTab.isCounter, true);
  assert.equal(await db.tab.count({ where: { establishmentId: store.id } }), 5);
  await db.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, status: "ACTIVE", accesses: { create: { establishmentId: store.id } } } });
  const product = await db.product.create({ data: { organizationId: organization.id, name: "Test product", slug: suffix, variants: { create: { name: "Default", isDefault: true, offerings: { create: { establishmentId: store.id, channel: "DELIVERY", price: 6 } } } } } });
  const baseUrl = process.env.TEST_APP_URL;
  if (baseUrl) {
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname));
    const payload = () => ({ clientRequestId: randomUUID(), customerName: "Test customer", customerPhone: "22999990000", address: "Test street, 100", items: [{ productId: product.id, quantity: 1 }] });
    const send = async (data: ReturnType<typeof payload>) => {
      const response = await fetch(new URL(`/api/public/orders/${store.id}`, baseUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      assert.ok(response.ok, JSON.stringify({ status: response.status, result }));
      return result.orderId as string;
    };
    const first = payload();
    const firstId = await send(first);
    const secondId = await send(payload());
    assert.equal(await send(first), firstId);
    const simultaneous = await Promise.all([send(payload()), send(payload())]);
    assert.equal(new Set([firstId, secondId, ...simultaneous]).size, 4);
    const deliveries = await db.deliveryOrder.findMany({ where: { establishmentId: store.id } });
    assert.equal(deliveries.length, 4);
    assert.ok(deliveries.every(delivery => delivery.kitchenOrderId));
    const tickets = await db.order.findMany({ where: { id: { in: deliveries.map(delivery => delivery.kitchenOrderId!) }, tab: { establishmentId: store.id } } });
    assert.equal(tickets.length, 4);
    assert.equal(new Set(tickets.map(ticket => ticket.tabId)).size, 4);
    console.log("Checkout sequential/concurrent requests and idempotency passed");
  }
  console.log(JSON.stringify({ checks: "concurrent counter tabs, physical table uniqueness, tenant scope and derived flag passed", establishmentId: store.id, productId: product.id }));
} finally {
  await db.$disconnect();
}
