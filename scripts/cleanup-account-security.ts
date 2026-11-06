import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const ago = (days: number) => new Date(Date.now() - days * 24 * 60 * 60_000);
const tokens = { OR: [{ expiresAt: { lt: ago(7) } }, { consumedAt: { lt: ago(7) } }] };
const buckets = { expiresAt: { lt: ago(1) } };
// Security audit retention is deliberately not automated here; the responsible
// operator must approve its retention separately from ephemeral credentials.
try {
  if (process.argv.includes("--execute")) {
    const result = await db.$transaction([
      db.accountSecurityToken.deleteMany({ where: tokens }),
      db.authRateBucket.deleteMany({ where: buckets }),
    ]);
    console.log(JSON.stringify({ tokensRemoved: result[0].count, bucketsRemoved: result[1].count }));
  } else {
    const [tokenCount, bucketCount] = await Promise.all([db.accountSecurityToken.count({ where: tokens }), db.authRateBucket.count({ where: buckets })]);
    console.log(JSON.stringify({ dryRun: true, eligibleTokens: tokenCount, eligibleBuckets: bucketCount }));
  }
} finally { await db.$disconnect(); }
