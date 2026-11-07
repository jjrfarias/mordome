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
  const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Origin: base, "Content-Type": "application/json", ...(authenticated ? { Cookie: `mordome_session=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
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
  const product = await db.product.create({ data: { organizationId: org.id, name: "Pastel de queijo", slug: stamp, variants: { create: { name: "Padrão", isDefault: true, offerings: { create: { establishmentId: unit.id, channel: "FLOOR", price: 20 } } } } } });
  assert.equal((await floor({ action: "CREATE_TAB", tableId: table.id, name: "Ana" }, false)).status, 401);
  const anaResponse = await floor({ action: "CREATE_TAB", tableId: table.id, name: "Ana" }); assert.equal(anaResponse.status, 200, JSON.stringify(anaResponse));
  const ana = anaResponse.data.createdTabId as string;
  const biaResponse = await floor({ action: "CREATE_TAB", tableId: table.id, name: "Bia" }); assert.equal(biaResponse.status, 200); const bia = biaResponse.data.createdTabId as string;
  assert.equal((await floor({ action: "CREATE_TAB", tableId: table.id, name: " ana " })).status, 409);
  assert.equal((await floor({ action: "CREATE_TAB", tableId: foreign.id, name: "Intruso" })).status, 404);
  assert.equal((await floor({ action: "RENAME_TAB", tabId: foreignTab.id, name: "Intruso" })).status, 404);
  assert.equal((await floor({ action: "ADD_ITEM", tableId: table.id, productId: product.id })).status, 409);
  assert.equal((await floor({ action: "ADD_ITEM", tableId: table.id, tabId: foreignTab.id, productId: product.id })).status, 404);
  for (let i = 0; i < 3; i++) assert.equal((await floor({ action: "ADD_ITEM", tableId: table.id, tabId: ana, productId: product.id })).status, 200);
  assert.equal((await floor({ action: "SEND_ORDER", tabId: ana })).status, 200);
  assert.equal((await floor({ action: "ADD_ITEM", tableId: table.id, tabId: bia, productId: product.id })).status, 200);
  assert.equal((await floor({ action: "SEND_ORDER", tabId: bia })).status, 200);
  assert.equal((await floor({ action: "CLOSE_EMPTY_TAB", tabId: ana })).status, 409);
  const saleBody = { action: "COMPLETE", channel: "FLOOR", tabId: bia, items: [{ productId: product.id, quantity: 1 }], payments: [{ method: "Dinheiro", amount: 22 }], idempotencyKey: randomUUID() };
  const paid = await request("/api/operations/sales", saleBody); assert.equal(paid.status, 201, JSON.stringify(paid));
  assert.equal(Number(paid.data.sale.total), 22);
  assert.equal((await db.tab.findUniqueOrThrow({ where: { id: ana } })).status, "OPEN");
  assert.equal((await db.tab.findUniqueOrThrow({ where: { id: bia } })).status, "PAID");
  const paidSnapshot = (await floor()).data;
  assert.equal(paidSnapshot.tables[0].tabs.length, 1);
  assert.ok(paidSnapshot.orders.some((order: { tabId: string; tabName: string }) => order.tabId === bia && order.tabName === "Bia"));
  const biaOrder = await db.order.findFirstOrThrow({ where: { tabId: bia } });
  assert.equal((await floor({ action: "CHANGE_ORDER_STATUS", orderId: biaOrder.id, status: "PREPARING" })).status, 200);
  assert.equal((await request("/api/operations/sales", saleBody)).status, 200);
  assert.equal(await db.sale.count({ where: { establishmentId: unit.id } }), 1);
  // Another round after the first dispatch sends only the newly added pastel.
  assert.equal((await floor({ action: "ADD_ITEM", tableId: table.id, tabId: ana, productId: product.id })).status, 200);
  assert.equal((await floor({ action: "SEND_ORDER", tabId: ana })).status, 200);
  const last = await db.order.findFirstOrThrow({ where: { tabId: ana }, orderBy: { sentAt: "desc" }, include: { items: true } });
  assert.equal(last.items.reduce((sum, i) => sum + Number(i.quantity), 0), 1);
  assert.equal((await floor()).data.orders.find((o: { id: string }) => o.id === last.id).tabName, "Ana");
  const concurrent = await Promise.all([floor({ action: "CREATE_TAB", tableId: table.id, name: "Carlos" }), floor({ action: "CREATE_TAB", tableId: table.id, name: "Carlos" })]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  const carlos = concurrent.find(r => r.status === 200)!.data.createdTabId as string;
  assert.equal((await floor({ action: "RENAME_TAB", tabId: carlos, name: " Ana " })).status, 409);
  assert.equal((await floor({ action: "RENAME_TAB", tabId: carlos, name: "Carlos Silva" })).status, 200);
  assert.equal((await floor({ action: "CLOSE_EMPTY_TAB", tabId: carlos })).status, 200);
  const paidAna = await request("/api/operations/sales", { ...saleBody, tabId: ana, payments: [{ method: "Dinheiro", amount: 88 }], idempotencyKey: randomUUID() });
  assert.equal(paidAna.status, 201, JSON.stringify(paidAna));
  const emptyTable = (await floor()).data.tables[0];
  assert.equal(emptyTable.tabs.length, 0); assert.equal(emptyTable.tab, null);
  assert.equal((await floor({ action: "CHANGE_ORDER_STATUS", orderId: last.id, status: "PREPARING" })).status, 200);
  assert.equal((await floor({ action: "ADD_ITEM", tableId: table.id, tabId: bia, productId: product.id })).status, 404);
  assert.equal((await floor({ action: "CREATE_TAB", tableId: table.id, name: " " })).status, 400);
  const summary = (await request("/api/operations/summary")).data;
  assert.equal(summary.recentSales.find((sale: { id: string }) => sale.id === paid.data.sale.id).tabName, "Bia");
  const printToken = randomBytes(32).toString("hex");
  const agent = await db.kitchenPrintAgent.create({ data: { establishmentId: unit.id, name: "Teste sem impressora física", tokenHash: createHash("sha256").update(printToken).digest("hex"), activatedAt: new Date(Date.now() - 3600000) } });
  assert.equal((await fetch(base + "/api/integrations/kitchen-print", { headers: { Authorization: `Bearer ${printToken}` } })).status, 200);
  const printJobs = await db.kitchenPrintJob.findMany({ where: { agentId: agent.id } });
  assert.ok(printJobs.some(job => Buffer.from(job.payload, "base64").toString().includes("Mesa 4 - Ana")));
  assert.ok(printJobs.some(job => Buffer.from(job.payload, "base64").toString().includes("Mesa 4 - Bia")));
  await db.rolePermission.deleteMany({ where: { roleId: role.id, permission: { key: "floor.operate" } } });
  assert.equal((await floor({ action: "CREATE_TAB", tableId: table.id, name: "Sem permissão" })).status, 403);
  // Keep a named second account for optional visual review.
  if (process.env.KEEP_TEST_FIXTURES === "true") writeFileSync(".tools/named-tabs-fixture.json", JSON.stringify({ username: user.username, password: "NamedTabs-QA-2026!", unit: unit.id, table: table.id }));
  console.log("PASS: named tabs, isolated payment/replay, tenant isolation, duplicate names/concurrency, incremental kitchen round.");
} finally {
  if (process.env.KEEP_TEST_FIXTURES !== "true") {
    const scope = { organizationId: { in: orgs } };
    await db.kitchenPrintAgent.deleteMany({ where: { establishment: scope } });
    await db.financialEntry.deleteMany({ where: scope });
    await db.order.deleteMany({ where: { tab: { establishment: scope } } });
    await db.tab.deleteMany({ where: { establishment: scope } });
    await db.sale.deleteMany({ where: scope });
    await db.cashSession.deleteMany({ where: { establishment: scope } });
    await db.auditEvent.deleteMany({ where: scope });
    await db.organization.deleteMany({ where: { id: { in: orgs } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  }
  await db.$disconnect();
}
