import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { OWNER_PERMISSIONS } from "../lib/permissions.ts";
import { hashPassword } from "../lib/password.ts";
import { writeFileSync } from "node:fs";

const url = process.env.TEST_DATABASE_URL, base = process.env.TEST_APP_URL ?? "http://127.0.0.1:3022";
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith("_test") || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Somente banco e aplicação locais de teste.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const stamp = randomUUID(), token = randomBytes(32).toString("base64url"), orgs: string[] = [], users: string[] = [];
async function request(path: string, body?: object, authenticated = true) {
  const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Origin: base, "Content-Type": "application/json", "x-forwarded-for": `127.0.1.${Math.floor(Math.random()*250)+1}`, ...(authenticated ? { Cookie: `mordome_session=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const floor = (body?: object, authenticated = true) => request("/api/operations/floor", body, authenticated);
try {
  const org = await db.organization.create({ data: { name: "Comandas QA", slug: stamp } }); orgs.push(org.id);
  const unit = await db.establishment.create({ data: { organizationId: org.id, name: "Comandas por nome", slug: stamp } });
  const other = await db.establishment.create({ data: { organizationId: org.id, name: "Outra unidade", slug: `other-${stamp}` } });
  const user = await db.user.create({ data: { username: `named-${stamp.slice(0, 8)}`, name: "Operador QA", passwordHash: await hashPassword("NamedTabs-QA-2026!") } }); users.push(user.id);
  const permissions = await Promise.all(OWNER_PERMISSIONS.map(key => db.permission.upsert({ where: { key }, update: {}, create: { key, module: key.split(".")[0], description: key } })));
  const role = await db.customRole.create({ data: { organizationId: org.id, name: "Operador", permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } });
  await db.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, status: "ACTIVE", accesses: { create: { establishmentId: unit.id } }, roles: { create: { roleId: role.id } } } });
  await db.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), activeEstablishmentId: unit.id, expiresAt: new Date(Date.now() + 3600000) } });
  const table = await db.diningTable.create({ data: { establishmentId: unit.id, number: 4 } });
  const foreign = await db.diningTable.create({ data: { establishmentId: other.id, number: 4 } });
  const foreignTab = await db.tab.create({ data: { establishmentId: other.id, tableId: foreign.id, openedById: user.id } });
  await db.cashSession.create({ data: { establishmentId: unit.id, openedById: user.id, openingAmount: 0 } });
  const product = await db.product.create({ data: { organizationId: org.id, name: "Pastel de queijo", slug: stamp, variants: { create: { name: "Padrão", isDefault: true, offerings: { create: { establishmentId: unit.id, channel: "DELIVERY", price: 20 } } } } } });
  const area = await db.deliveryArea.create({ data: { establishmentId: unit.id, name: "Centro", neighborhoods: "Centro", deliveryFee: 7 } });
  const publicPath = `/api/public/orders/${unit.id}`;
  const payload = { clientRequestId: randomUUID(), customerName: "Ana QA", customerPhone: "22999990000", items: [{ productId: product.id, quantity: 2 }] };
  assert.equal((await request(publicPath, { ...payload, fulfillment: "DELIVERY" }, false)).status, 400);
  assert.equal((await request(publicPath, { ...payload, fulfillment: "INVALID" }, false)).status, 400);
  const pickupBody = { ...payload, fulfillment: "PICKUP", deliveryAreaId: area.id, destinationLat: -22, destinationLng: -43, locationConfirmed: true };
  const pickup = await request(publicPath, pickupBody, false); assert.equal(pickup.status, 201, JSON.stringify(pickup));
  const replay = await request(publicPath, pickupBody, false); assert.equal(replay.data.orderId, pickup.data.orderId);
  const dine = await request(publicPath, { ...payload, clientRequestId: randomUUID(), fulfillment: "DINE_IN" }, false); assert.equal(dine.status, 201, JSON.stringify(dine));
  const delivered = await request(publicPath, { ...payload, clientRequestId: randomUUID(), address: "Rua Centro, 10", neighborhood: "Centro", deliveryAreaId: area.id }, false); assert.equal(delivered.status, 201, JSON.stringify(delivered));
  const legacy = await db.deliveryOrder.findUniqueOrThrow({ where: { id: delivered.data.orderId } }); assert.equal(legacy.fulfillment, "DELIVERY"); assert.equal(Number(legacy.deliveryFee), 7);
  const printToken = randomBytes(32).toString("hex");
  const agent = await db.kitchenPrintAgent.create({ data: { establishmentId: unit.id, name: "Sem impressora física", tokenHash: createHash("sha256").update(printToken).digest("hex"), activatedAt: new Date(Date.now() - 3600000) } });
  assert.equal((await fetch(base + "/api/integrations/kitchen-print", { headers: { Authorization: `Bearer ${printToken}` } })).status, 200);
  const jobs = await db.kitchenPrintJob.findMany({ where: { agentId: agent.id } });
  assert.ok(jobs.some(j => Buffer.from(j.payload, "base64").toString().includes("Retirada no local")));
  assert.ok(jobs.some(j => Buffer.from(j.payload, "base64").toString().includes("Consumir na loja")));
  for (const [id, fulfillment] of [[pickup.data.orderId, "PICKUP"], [dine.data.orderId, "DINE_IN"]]) {
    const order = await db.deliveryOrder.findUniqueOrThrow({ where: { id } });
    assert.equal(order.fulfillment, fulfillment); assert.equal(Number(order.deliveryFee), 0); assert.equal(order.deliveryAreaId, null); assert.equal(order.destinationLat, null); assert.equal(order.courierId, null);
    const op = (action: object) => request("/api/operations/delivery", { orderId: id, ...action });
    assert.equal((await op({ action: "ASSIGN_COURIER", courierId: user.id })).status, 409);
    const saleBody = { action: "COMPLETE", channel: "DELIVERY", deliveryOrderId: id, items: [{ productId: product.id, quantity: 2 }], payments: [{ method: "Dinheiro", amount: 40 }], idempotencyKey: randomUUID() };
    assert.equal((await request("/api/operations/sales", saleBody)).status, 409);
    assert.equal((await op({ action: "CHANGE_STATUS", status: "PREPARING" })).status, 200);
    assert.equal((await op({ action: "CHANGE_STATUS", status: "OUT_FOR_DELIVERY" })).status, 409);
    assert.equal((await request("/api/operations/sales", saleBody)).status, 409);
    assert.equal((await floor({ action: "CHANGE_ORDER_STATUS", orderId: order.kitchenOrderId, status: "READY" })).status, 200);
    const paid = await request("/api/operations/sales", saleBody); assert.equal(paid.status, 201, JSON.stringify(paid)); assert.equal(Number(paid.data.sale.total), 40);
    const replayPaid = await request("/api/operations/sales", saleBody); assert.equal(replayPaid.status, 200); assert.equal(replayPaid.data.sale.id, paid.data.sale.id);
    const finished = await db.deliveryOrder.findUniqueOrThrow({ where: { id } }); assert.equal(finished.status, "DELIVERED"); assert.ok(finished.saleId);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.kitchenOrderId! } })).status, "DELIVERED");
  }
  console.log("PASS: fulfillment validation, zero fees, no courier, kitchen labels/print, readiness, payment and replay, legacy delivery fee.");
} finally {
  if (process.env.KEEP_TEST_FIXTURES !== "true") {
    const scope = { organizationId: { in: orgs } };
    await db.kitchenPrintAgent.deleteMany({ where: { establishment: scope } });
    await db.financialEntry.deleteMany({ where: scope });
    await db.order.deleteMany({ where: { tab: { establishment: scope } } });
    await db.tab.deleteMany({ where: { establishment: scope } });
    await db.deliveryOrder.deleteMany({ where: { establishment: scope } });
    await db.sale.deleteMany({ where: scope });
    await db.cashSession.deleteMany({ where: { establishment: scope } });
    await db.auditEvent.deleteMany({ where: scope });
    await db.organization.deleteMany({ where: { id: { in: orgs } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  }
  await db.$disconnect();
}
