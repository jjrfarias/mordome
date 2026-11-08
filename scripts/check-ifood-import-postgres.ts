import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { importIfoodOrder } from "../lib/ifood-import-service.ts";
import { ifoodRequestId, type IfoodCapture } from "../lib/ifood-import.ts";
import { hashPassword } from "../lib/password.ts";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || !["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname)) throw Error("Use um TEST_DATABASE_URL local e isolado.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const suffix = randomUUID();
  const org = await db.organization.create({ data: { name: `iFood QA ${suffix}`, slug: suffix } });
  const store = await db.establishment.create({ data: { organizationId: org.id, name: "Loja QA iFood", slug: suffix } });
  const user = await db.user.create({ data: { name: "Operador QA", username: suffix, passwordHash: "no-password" } });
  const actor = { establishmentId: store.id, organizationId: org.id, userId: user.id };
  const input: IfoodCapture = { version: 1, externalId: randomUUID(), displayId: "4228", storeName: "Loja QA iFood", customerName: "Cliente de teste", address: "Rua de teste, 1", sourceStatus: "Em preparo", payment: "PAID_ONLINE", fulfillment: "DELIVERY", deliveryFeeCents: 1199, subtotalCents: 6999, orderNotes: "Não enviar talheres", sourceText: "Pedido de teste sintético. Pago via iFood, não precisa cobrar na entrega", items: [{ name: "Pastel de Carne", quantity: 2, lineTotalCents: 5800, details: "Sem cebola · 2 × queijo extra" }] };
  const results = await Promise.all(Array.from({ length: 8 }, () => importIfoodOrder(db, actor, input)));
  assert.equal(new Set(results.map(result => result.orderId)).size, 1);
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  assert.equal(await db.deliveryOrder.count({ where: { establishmentId: store.id } }), 1);
  assert.equal(await db.order.count({ where: { tab: { establishmentId: store.id } } }), 1);
  assert.equal(await db.tab.count({ where: { establishmentId: store.id } }), 1);
  assert.equal(await db.auditEvent.count({ where: { establishmentId: store.id } }), 1);
  const delivery = await db.deliveryOrder.findUniqueOrThrow({ where: { id: results[0].orderId }, include: { items: true } });
  assert.equal(delivery.origin, "IFOOD"); assert.equal(delivery.saleId, null);
  assert.equal(delivery.items[0].quantity, 2); assert.equal(Number(delivery.items[0].unitPrice), 29);
  assert.equal(await db.sale.count({ where: { establishmentId: store.id } }), 0);
  const retry = await importIfoodOrder(db, actor, { ...input, sourceStatus: "Concluído" });
  assert.equal(retry.duplicate, true);
  const bad = { ...input, externalId: randomUUID() };
  await assert.rejects(importIfoodOrder(db, { ...actor, organizationId: randomUUID() }, bad));
  assert.equal(await db.deliveryOrder.count({ where: { clientRequestId: ifoodRequestId(bad.externalId) } }), 0);
  assert.equal(await db.order.count({ where: { tab: { establishmentId: store.id } } }), 1);
  await assert.rejects(importIfoodOrder(db, actor, { ...input, externalId: randomUUID(), sourceStatus: "Concluído" }));
  const other = await db.establishment.create({ data: { organizationId: org.id, name: "Outra loja QA", slug: `${suffix}-other` } });
  const second = await importIfoodOrder(db, { ...actor, establishmentId: other.id }, input);
  assert.notEqual(second.orderId, results[0].orderId);
  if (process.env.TEST_APP_URL) {
    const base = new URL(process.env.TEST_APP_URL);
    if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw Error("TEST_APP_URL precisa ser local.");
    const permissions = await Promise.all(["delivery.operate", "floor.operate", "pos.sell"].map(key => db.permission.upsert({ where: { key }, update: {}, create: { key, module: "qa", description: "QA" } })));
    const role = await db.customRole.create({ data: { organizationId: org.id, name: "QA", permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } });
    await db.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, status: "ACTIVE", accesses: { create: { establishmentId: store.id } }, roles: { create: { roleId: role.id } } } });
    const token = randomUUID();
    await db.session.create({ data: { userId: user.id, activeEstablishmentId: store.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
    const payload = { establishmentId: store.id, confirmed: true, order: { ...input, externalId: randomUUID() } };
    const request = async (body: object, expected: number, authenticated = true, origin = base.origin) => {
      const response = await fetch(new URL("/api/integrations/ifood-import", base), { method: "POST", headers: { "content-type": "application/json", origin, ...(authenticated ? { cookie: `mordome_session=${token}` } : {}) }, body: JSON.stringify(body) });
      const json = await response.json(); assert.equal(response.status, expected, JSON.stringify(json)); return json;
    };
    await request(payload, 401, false);
    await request(payload, 403, true, "https://attacker.invalid");
    await request({ ...payload, establishmentId: other.id }, 409);
    await request({ ...payload, confirmed: false }, 400);
    await request({ ...payload, order: { ...payload.order, subtotalCents: 0 } }, 409);
    const created = await request(payload, 201);
    const duplicate = await request(payload, 200);
    assert.equal(created.orderId, duplicate.orderId);
    const api = async (path: string, body: object, expected = 200, method = "POST") => {
      const response = await fetch(new URL(path, base), { method, headers: { "content-type": "application/json", origin: base.origin, cookie: `mordome_session=${token}` }, body: JSON.stringify(body) });
      const json = await response.json(); assert.equal(response.status, expected, JSON.stringify(json)); return json;
    };
    await api("/api/integrations/ifood-import", { orderId: created.orderId }, 409, "PATCH");
    for (const status of ["PREPARING", "READY"]) await api("/api/operations/floor", { action: "CHANGE_ORDER_STATUS", orderId: created.kitchenOrderId, status });
    await api("/api/integrations/ifood-import", { orderId: created.orderId }, 200, "PATCH");
    assert.equal((await db.deliveryOrder.findUniqueOrThrow({ where: { id: created.orderId } })).status, "DELIVERED");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: created.kitchenOrderId } })).status, "DELIVERED");
    await db.cashSession.create({ data: { establishmentId: store.id, openedById: user.id, openingAmount: 0 } });
    const sale = await api("/api/operations/sales", { action: "COMPLETE", channel: "DELIVERY", deliveryOrderId: created.orderId, items: [{ productId: "external", quantity: 2 }], payments: [{ method: "Pix", amount: 69.99 }], idempotencyKey: randomUUID() }, 409);
    assert.match(sale.error, /iFood/);
    const kitchenRow = await db.order.findUniqueOrThrow({ where: { id: created.kitchenOrderId } });
    const tabSale = await api("/api/operations/sales", { action: "COMPLETE", channel: "FLOOR", tabId: kitchenRow.tabId, items: [{ productId: "external", quantity: 2 }], payments: [{ method: "Pix", amount: 69.99 }], idempotencyKey: randomUUID() }, 409);
    assert.match(tabSale.error, /iFood/);
    // Recovery of an old kitchen ticket must preserve an already cancelled delivery.
    await db.deliveryOrder.update({ where: { id: created.orderId }, data: { status: "CANCELLED" } });
    await db.order.update({ where: { id: created.kitchenOrderId }, data: { status: "READY" } });
    await api("/api/operations/floor", { action: "CHANGE_ORDER_STATUS", orderId: created.kitchenOrderId, status: "DELIVERED" });
    assert.equal((await db.deliveryOrder.findUniqueOrThrow({ where: { id: created.orderId } })).status, "CANCELLED");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: created.kitchenOrderId } })).status, "CANCELLED");
    if (process.env.TEST_UI_FIXTURE) {
      await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("Ifood-QA-local-2026!") } });
      await writeFile(process.env.TEST_UI_FIXTURE, JSON.stringify({ base: base.origin, payload: { ...input, externalId: randomUUID() }, username: user.username, storeId: store.id }));
    }
  }
  console.log("PASS: 8 concurrent imports => 1 order, 1 kitchen ticket, 1 audit; retry, rollback, tenant isolation, API authentication, CSRF, confirmation, lifecycle and payment guard.");
} finally { await db.$disconnect(); }
