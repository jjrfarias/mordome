import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID, randomInt } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const url = process.env.TEST_APP_URL, connectionString = process.env.TEST_DATABASE_URL;
if (!url || !connectionString || ![url, connectionString].every(value => ["localhost", "127.0.0.1"].includes(new URL(value).hostname))) throw Error("Use an isolated local app/database");
// Application must use WHATSAPP_GATEWAY_URL=http://127.0.0.1:3113 and the synthetic token below.
const codes = new Map<string, string>();
const gateway = http.createServer(async (req, res) => {
  if (req.headers.authorization !== "Bearer local-test-gateway-token-0123456789") { res.writeHead(401); res.end(); return; }
  if (req.url?.endsWith("/send-code")) { let body = ""; for await (const chunk of req) body += chunk; const data = JSON.parse(body); codes.set(data.requestId, data.code); }
  res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ status: "READY" }));
});
await new Promise<void>(resolve => gateway.listen(3113, "127.0.0.1", resolve));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const suffix = randomUUID();
  const org = await db.organization.create({ data: { name: "Customer QA", slug: suffix } });
  const unit = await db.establishment.create({ data: { organizationId: org.id, name: "Customer QA", slug: suffix } });
  const other = await db.establishment.create({ data: { organizationId: org.id, name: "Other QA", slug: `${suffix}-other` } });
  const product = await db.product.create({ data: { organizationId: org.id, name: "Test", slug: suffix, variants: { create: { name: "Default", offerings: { create: { establishmentId: unit.id, channel: "DELIVERY", price: 18 } } } }, ingredientGroups: { create: { name: "Adicional", minSelections: 0, maxSelections: 1, options: { create: { name: "Bacon", priceDelta: 2 } } } } }, include: { ingredientGroups: { include: { options: true } } } });
  const phone = `229${String(randomInt(100000000)).padStart(8, "0")}`;
  const route = `/api/public/customers/${unit.id}`;
  let cookie = "";
  async function request(path: string, data?: object, expected = 200, authenticated = true) {
    const response = await fetch(new URL(path, url), { method: data ? "POST" : "GET", headers: { origin: url!, "content-type": "application/json", ...(authenticated && cookie ? { cookie } : {}) }, body: data ? JSON.stringify(data) : undefined });
    const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result));
    return { result, response };
  }
  const order = (withAccount = false) => ({ clientRequestId: randomUUID(), customerName: "QA", customerPhone: phone, address: "Test 100", withAccount, items: [{ productId: product.id, quantity: 1, selectedOptions: [{ groupId: product.ingredientGroups[0].id, optionIds: [product.ingredientGroups[0].options[0].id] }] }] });
  await request(`/api/public/orders/${unit.id}`, order(), 201);
  const challenge = (await request(route, { action: "REQUEST_CODE", phone })).result.challengeId;
  assert.ok(codes.has(challenge));
  await request(route, { action: "REQUEST_CODE", phone }, 429);
  const verify = { action: "VERIFY_CODE", challengeId: challenge, name: "QA", code: codes.get(challenge) };
  await request(`/api/public/customers/${other.id}`, verify, 400);
  await request(route, { ...verify, code: verify.code === "000000" ? "000001" : "000000" }, 400);
  const login = await request(route, verify);
  const header = login.response.headers.get("set-cookie")!;
  assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=lax/i);
  cookie = header.split(";")[0];
  assert.equal((await request(route)).result.totalOrders, 0, "must not claim guest history by phone");
  await request(route, verify, 400);
  const created = await request(`/api/public/orders/${unit.id}`, order(true), 201);
  const view = (await request(route)).result;
  assert.equal(view.totalOrders, 1); assert.equal(view.orders[0].id, created.result.orderId);
  assert.equal(view.orders[0].items[0].unitPrice, 20);
  assert.equal(view.orders[0].totalCents, 2000);
  assert.equal(view.completedOrders, 0);
  assert.equal((await request(`/api/public/customers/${other.id}`)).result.account, null);
  await request("/api/operations/delivery", undefined, 403);
  await request("/api/admin/whatsapp", undefined, 403);
  const account = await db.customerAccount.findFirstOrThrow({ where: { establishmentId: unit.id } });
  await assert.rejects(db.deliveryOrder.create({ data: { establishmentId: other.id, customerAccountId: account.id, customerName: "QA", customerPhone: phone, address: "Test" } }), { code: "P2003" });
  await request(route, { action: "LOGOUT" });
  assert.deepEqual((await db.customerAccountEvent.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "asc" } })).map(event => event.action), ["LOGIN", "LOGOUT"]);
  assert.equal((await request(route)).result.account, null);
  await request(`/api/public/orders/${unit.id}`, order(true), 401);
  const secondPhone = `229${String(randomInt(100000000)).padStart(8, "0")}`;
  const second = (await request(route, { action: "REQUEST_CODE", phone: secondPhone })).result.challengeId;
  for (let i = 0; i < 5; i++) await request(route, { ...verify, challengeId: second, code: codes.get(second) === "000000" ? "000001" : "000000" }, 400);
  await request(route, { ...verify, challengeId: second, code: codes.get(second) }, 400);
  assert.equal((await db.customerChallenge.findUniqueOrThrow({ where: { id: second } })).attempts, 5);
  const expired = (await request(route, { action: "REQUEST_CODE", phone: `229${String(randomInt(100000000)).padStart(8, "0")}` })).result.challengeId;
  await db.customerChallenge.update({ where: { id: expired }, data: { expiresAt: new Date(0) } });
  await request(route, { ...verify, challengeId: expired, code: codes.get(expired) }, 400);
  const concurrent = (await request(route, { action: "REQUEST_CODE", phone: `229${String(randomInt(100000000)).padStart(8, "0")}` })).result.challengeId;
  const attempts = await Promise.all([1, 2].map(() => fetch(new URL(route, url), { method: "POST", headers: { origin: url!, "content-type": "application/json" }, body: JSON.stringify({ ...verify, challengeId: concurrent, code: codes.get(concurrent) }) })));
  assert.equal(attempts.filter(response => response.status === 200).length, 1, "concurrent verification must create exactly one session");
  assert.ok(attempts.every(response => [200, 400, 409].includes(response.status)));
  await new Promise<void>(resolve => gateway.close(() => resolve()));
  await request(route, { action: "REQUEST_CODE", phone: secondPhone }, 503);
  await request(`/api/public/orders/${unit.id}`, order(), 201, false);
  console.log("PASS customer account: OTP limits/expiry/replay/concurrency, tenant isolation, no historical phone claiming, account order, optional extra price, logout/audit, employee/admin isolation and guest checkout during outage");
} finally { gateway.close(); await db.$disconnect(); }
