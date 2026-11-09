// Run on the server. The SHA-256 hash identifies an existing agent; no raw token.
import pg from "pg";
const hash = process.argv[2];
if (!/^[a-f0-9]{64}$/.test(hash ?? "")) throw Error("Agent token hash required");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const result = await db.query('UPDATE "KitchenPrintAgent" a SET "receiptsActivatedAt"=COALESCE(a."receiptsActivatedAt",NOW()) FROM "Establishment" e WHERE a."tokenHash"=$1 AND a.active=true AND a."establishmentId"=e.id AND e.active=true RETURNING a.id,e.name,a."receiptsActivatedAt"', [hash]);
  if (result.rowCount !== 1) throw Error("Exactly one active agent required");
  console.log(JSON.stringify(result.rows[0]));
} finally { await db.end(); }
