import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { addToDelivery } from "../lib/delivery-additions.ts";
import { linkedKitchen } from "../lib/delivery-kitchen.ts";
import { hashPassword } from "../lib/password.ts";
const url = process.env.TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw Error("Local DB required");
const base = process.env.TEST_APP_URL;
if (base && !["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw Error("Local app required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  const suffix = randomUUID();
  const org = await db.organization.create({ data: { name: "Acréscimos QA", slug: suffix } });
  const store = await db.establishment.create({ data: { organizationId: org.id, name: "Loja QA adicionais", slug: suffix, serviceRate: 12 } });
  const user = await db.user.create({ data: { name: "Operador QA", username: `qa-${suffix.slice(0, 8)}`, passwordHash: await hashPassword("Qa-additions-2026!") } });
  const actor = { establishmentId: store.id, organizationId: org.id, userId: user.id };
  const product = await db.product.create({ data: { organizationId: org.id, name: "Pastel de carne QA", slug: suffix, variants: { create: { name: "Padrão", isDefault: true, offerings: { create: ["FLOOR", "DELIVERY", "POS"].map(channel => ({ channel: channel as "FLOOR" | "DELIVERY" | "POS", establishmentId: store.id, price: 20 })) } } }, ingredientGroups: { create: { name: "Adicionais", minSelections: 0, maxSelections: 2, options: { create: [{ name: "Cheddar", priceDelta: 3 }, { name: "Bacon", priceDelta: 4 }] } } } }, include: { ingredientGroups: { include: { options: true } } } });
  const counter = await db.diningTable.create({ data: { establishmentId: store.id, number: 0, isCounter: true } });
  const make = async () => {
    const tab = await db.tab.create({ data: { establishmentId: store.id, tableId: counter.id, openedById: user.id } });
    const ti = await db.tabItem.create({ data: { tabId: tab.id, productId: product.id, productName: product.name, addedById: user.id, quantity: 2, sentQuantity: 2, unitPrice: 20 } });
    const kitchen = await db.order.create({ data: { tabId: tab.id, sentById: user.id, status: "READY", items: { create: { tabItemId: ti.id, productName: product.name, quantity: 2 } } } });
    return db.deliveryOrder.create({ data: { establishmentId: store.id, customerName: "Cliente QA retirada", customerPhone: "21999999999", address: "Retirada no balcão", origin: "ONLINE", fulfillment: "PICKUP", status: "PREPARING", kitchenOrderId: kitchen.id, items: { create: { productId: product.id, productName: product.name, quantity: 2, unitPrice: 20 } } }, include: { items: true } });
  };
  const order = await make(); const group = product.ingredientGroups[0]; const cheddar = group.options.find(o => o.name === "Cheddar")!;
  const input = { orderId: order.id, mode: "EXTRAS" as const, itemId: order.items[0].id, quantity: 1, selectedOptions: [{ groupId: group.id, optionIds: [cheddar.id] }], idempotencyKey: randomUUID() };
  const result = await Promise.all(Array.from({ length: 8 }, () => addToDelivery(db, actor, input)));
  assert.equal(new Set(result.map(r => r.kitchenOrderId)).size, 1);
  const changed = await db.deliveryOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, supplements: { include: { items: true } } } });
  assert.deepEqual(changed.items.map(i => Number(i.unitPrice)).sort(), [20, 23]);
  assert.equal(changed.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0), 43);
  assert.equal(changed.supplements.length, 1); assert.match(changed.supplements[0].items[0].productName, /ACRESCENTAR.*Cheddar.*NAO REFAZER/);
  assert.equal(Number(changed.supplements[0].items[0].quantity), 1);
  assert.equal((await linkedKitchen(db, store.id, order.kitchenOrderId))?.status, "RECEIVED");
  await assert.rejects(addToDelivery(db, { ...actor, establishmentId: "other" }, { ...input, idempotencyKey: randomUUID() }));
  await assert.rejects(addToDelivery(db, actor, { ...input, quantity: 99, idempotencyKey: randomUUID() }));
  const withExtra = changed.items.find(i => Number(i.unitPrice) === 23)!;
  await assert.rejects(addToDelivery(db, actor, { ...input, itemId: withExtra.id, idempotencyKey: randomUUID() }));
  await addToDelivery(db, actor, { orderId: order.id, mode: "PRODUCT", productId: product.id, quantity: 1, selectedOptions: [], idempotencyKey: randomUUID() });
  const after = await db.deliveryOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
  assert.equal(after.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0), 63);
  if (base) {
    const permissions = await Promise.all(["delivery.operate", "floor.operate", "floor.manage", "cash.open", "pos.sell"].map(key => db.permission.upsert({ where: { key }, update: {}, create: { key, module: "qa", description: "QA" } })));
    const role = await db.customRole.create({ data: { organizationId: org.id, name: "QA", permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } });
    await db.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, status: "ACTIVE", accesses: { create: { establishmentId: store.id } }, roles: { create: { roleId: role.id } } } });
    const token = randomUUID(); await db.session.create({ data: { userId: user.id, activeEstablishmentId: store.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
    const api = async (path: string, body: object, expected = 200, cookie = true, origin = base) => {
      const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", origin, ...(cookie ? { cookie: `mordome_session=${token}` } : {}) }, body: JSON.stringify(body) });
      const json = await r.json(); assert.equal(r.status, expected, JSON.stringify(json)); return json;
    };
    await api("/api/operations/delivery/additions", input, 403, false);
    await api("/api/operations/delivery/additions", input, 403, true, "https://wrong.invalid");
    await api("/api/operations/delivery/additions", input);
    await db.cashSession.create({ data: { establishmentId: store.id, openedById: user.id, openingAmount: 0 } });
    const sale = { action: "COMPLETE", channel: "DELIVERY", deliveryOrderId: order.id, items: [{ productId: product.id, quantity: 1 }], payments: [{ method: "Pix", amount: 63 }], idempotencyKey: randomUUID() };
    await api("/api/operations/sales", sale, 409);
    const supplements = await db.order.findMany({ where: { deliveryParentId: order.id } });
    for (const supplement of supplements) for (const status of ["PREPARING", "READY"]) await api("/api/operations/floor", { action: "CHANGE_ORDER_STATUS", orderId: supplement.id, status });
    const paid = await api("/api/operations/sales", sale, 201);
    assert.equal(Number((await db.sale.findUniqueOrThrow({ where: { id: paid.sale.id } })).total), 63);
    assert.equal(await db.order.count({ where: { deliveryParentId: order.id, status: { not: "DELIVERED" } } }), 0);
    await api("/api/operations/delivery/additions", { ...input, idempotencyKey: randomUUID() }, 409);
    for (const waive of [false, true]) {
      const table = await db.diningTable.create({ data: { establishmentId: store.id, number: waive ? 2 : 1 } });
      const tab = await db.tab.create({ data: { establishmentId: store.id, tableId: table.id, openedById: user.id, items: { create: { productId: product.id, productName: product.name, quantity: 1, sentQuantity: 1, unitPrice: 20, addedById: user.id } } } });
      const payment = await api("/api/operations/sales", { action: "COMPLETE", channel: "FLOOR", tabId: tab.id, waiveService: waive, items: [{ productId: product.id, quantity: 1 }], payments: [{ method: "Pix", amount: waive ? 20 : 22.4 }], idempotencyKey: randomUUID() }, 201);
      const record = await db.sale.findUniqueOrThrow({ where: { id: payment.sale.id } });
      assert.equal(Number(record.serviceAmount), waive ? 0 : 2.4); assert.equal(record.serviceWaived, waive);
      assert.equal(Number(record.discount), 0);
    }
    await make();
    const table = await db.diningTable.create({ data: { establishmentId: store.id, number: 3 } });
    await db.tab.create({ data: { establishmentId: store.id, tableId: table.id, openedById: user.id, items: { create: { productId: product.id, productName: product.name, quantity: 1, sentQuantity: 1, unitPrice: 20, addedById: user.id } } } });
    await writeFile(".tools/additions-ui.json", JSON.stringify({ username: user.username, password: "Qa-additions-2026!", establishmentId: store.id, base }));
  }
  console.log("PASS: cheddar on one of two items, locked prices, 8 retries, delta-only kitchen ticket, invalid quantity/options, tenant, new product" + (base ? "; HTTP auth/origin, readiness, payment 63, paid lock, service 12%/waived 0 with no discount permission" : ""));
} finally { await db.$disconnect(); }
