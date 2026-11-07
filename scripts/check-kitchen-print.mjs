// HTTP/database smoke test: temporary agents/jobs only; never opens a printer.
import pg from "pg";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const url = process.argv[2];
if (!url?.startsWith("https://")) throw new Error("Informe URL HTTPS.");
await client.connect();
const ids = [];
const token = () => randomBytes(32).toString("hex");
async function request(key, method = "GET", body) {
  return fetch(`${url}/api/integrations/kitchen-print`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
try {
  assert.equal((await request(token())).status, 401);
  const rows = await client.query('SELECT o.id,t."establishmentId" FROM "Order" o JOIN "Tab" t ON t.id=o."tabId" WHERE o.status<>\'CANCELLED\' AND NOT EXISTS (SELECT 1 FROM "OrderItem" i JOIN "OrderItemCancellation" c ON c."orderItemId"=i.id WHERE i."orderId"=o.id) ORDER BY o."sentAt" LIMIT 1');
  assert.ok(rows.rowCount, "Precisa de pedido histórico sem cancelamento para fixture de impressão.");
  const order = rows.rows[0];
  const other = await client.query('SELECT id FROM "Establishment" WHERE id<>$1 AND active=true LIMIT 1', [order.establishmentId]);
  assert.ok(other.rowCount);
  const tokens = [token(), token()];
  for (let i = 0; i < 2; i++) {
    const id = randomUUID(); ids.push(id);
    await client.query('INSERT INTO "KitchenPrintAgent" (id,"establishmentId",name,"tokenHash","activatedAt") VALUES ($1,$2,\'Integration smoke test\',$3,\'2099-01-01\')', [id, i ? other.rows[0].id : order.establishmentId, createHash("sha256").update(tokens[i]).digest("hex")]);
  }
  const jobId = randomUUID();
  await client.query('INSERT INTO "KitchenPrintJob" (id,"agentId","orderId",payload,"updatedAt") VALUES ($1,$2,$3,$4,NOW())', [jobId, ids[0], order.id, Buffer.from("TEST ONLY").toString("base64")]);
  assert.equal((await request(tokens[1], "POST", { jobId, action: "CLAIM" })).status, 404);
  const queue = await (await request(tokens[0])).json();
  assert.deepEqual(queue.jobs.map(job => job.id), [jobId]);
  const claims = await Promise.all([request(tokens[0], "POST", { jobId, action: "CLAIM" }), request(tokens[0], "POST", { jobId, action: "CLAIM" })]);
  assert.deepEqual(claims.map(response => response.status).sort(), [200, 409]);
  assert.equal((await request(tokens[1], "POST", { jobId, action: "ACK" })).status, 404);
  assert.equal((await request(tokens[0], "POST", { jobId, action: "ACK" })).status, 200);
  assert.equal((await request(tokens[0], "POST", { jobId, action: "ACK" })).status, 200);
  const job = await client.query('SELECT status FROM "KitchenPrintJob" WHERE id=$1', [jobId]);
  assert.equal(job.rows[0].status, "SENT");
  await client.query('UPDATE "KitchenPrintAgent" SET active=false WHERE id=$1', [ids[0]]);
  assert.equal((await request(tokens[0])).status, 401);
  console.log("PASS: token, tenant isolation, concurrent claim, idempotent ACK, revocation. No physical print.");
} finally {
  await client.query('DELETE FROM "KitchenPrintAgent" WHERE id=ANY($1::text[])', [ids]);
  await client.end();
}
