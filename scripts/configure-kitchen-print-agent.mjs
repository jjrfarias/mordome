// Run in the trusted server environment. No user passwords or raw device tokens.
// node scripts/configure-kitchen-print-agent.mjs <establishmentId> <sha256-token>
import pg from "pg";
import { randomUUID } from "node:crypto";
const [establishmentId, tokenHash] = process.argv.slice(2);
if (!establishmentId || !/^[a-f0-9]{64}$/.test(tokenHash ?? "")) throw new Error("Informe unidade e hash SHA-256 do token.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  const unit = await client.query('SELECT id,name FROM "Establishment" WHERE id=$1 AND active=true FOR UPDATE', [establishmentId]);
  if (!unit.rowCount) throw new Error("Unidade inexistente ou inativa.");
  const agents = await client.query('SELECT id FROM "KitchenPrintAgent" WHERE "establishmentId"=$1 AND active=true', [establishmentId]);
  if (agents.rowCount) throw new Error("Esta unidade já tem agente ativo; desative o anterior explicitamente antes de substituir.");
  const result = await client.query('INSERT INTO "KitchenPrintAgent" (id,"establishmentId",name,"tokenHash") VALUES ($1,$2,$3,$4) RETURNING id,"activatedAt"', [randomUUID(), establishmentId, "Cozinha - Goldensky Bluetooth", tokenHash]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ establishment: unit.rows[0].name, ...result.rows[0] }));
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { await client.end(); }
