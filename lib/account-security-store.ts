import type { PrismaClient, Prisma } from "../generated/prisma/client.ts";
import { hashSecurityToken, newSecurityToken, usableSecurityToken, type SecurityPurpose } from "./account-security-policy.ts";

type Database = Pick<PrismaClient, "$transaction" | "accountSecurityToken" | "user" | "$queryRaw">;

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  return tx.user.findUnique({ where: { id: userId } });
}

export async function issueAccountToken(database: Database, userId: string, purpose: SecurityPurpose, email: string, expectedPasswordHash?: string) {
  return database.$transaction(async tx => {
    const user = await lockUser(tx, userId);
    if (!user?.active || (expectedPasswordHash && user.passwordHash !== expectedPasswordHash)) return null;
    if (purpose === "RESET_PASSWORD" && (!user.emailVerifiedAt || user.email !== email)) return null;
    const issued = newSecurityToken(purpose);
    await tx.accountSecurityToken.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
    if (purpose === "VERIFY_EMAIL") await tx.user.update({ where: { id: userId }, data: { pendingEmail: email } });
    const record = await tx.accountSecurityToken.create({ data: {
      userId, purpose, email, tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, credentialHash: hashSecurityToken(user.passwordHash),
    } });
    await tx.accountSecurityEvent.create({ data: { userId, action: purpose === "VERIFY_EMAIL" ? "EMAIL_VERIFICATION_REQUESTED" : "PASSWORD_RESET_REQUESTED" } });
    return { ...issued, id: record.id };
  });
}

export async function consumeAccountToken(database: Database, rawToken: string, purpose: SecurityPurpose, passwordHash?: string) {
  const found = await database.accountSecurityToken.findUnique({ where: { tokenHash: hashSecurityToken(rawToken) } });
  if (!found) return null;
  return database.$transaction(async tx => {
    const user = await lockUser(tx, found.userId);
    const token = await tx.accountSecurityToken.findUnique({ where: { id: found.id } });
    if (!user || !token || !usableSecurityToken(token, user, purpose) || (purpose === "RESET_PASSWORD" && !passwordHash)) return null;
    const now = new Date();
    // Row lock serializes issuance, reset and confirmation for this global identity.
    if (purpose === "RESET_PASSWORD") {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, pendingEmail: null } });
    } else {
      await tx.user.update({ where: { id: user.id }, data: { email: token.email, emailVerifiedAt: now, pendingEmail: null } });
    }
    await tx.accountSecurityToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: now } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.accountSecurityEvent.create({ data: { userId: user.id, action: purpose === "RESET_PASSWORD" ? "PASSWORD_RESET_COMPLETED" : "EMAIL_VERIFIED" } });
    return { userId: user.id, email: purpose === "VERIFY_EMAIL" ? token.email : user.email!, previousEmail: user.email };
  });
}

export async function consumeAuthRate(database: Pick<PrismaClient, "$queryRaw">, key: string, limit: number, windowMs: number) {
  const rows = await database.$queryRaw<{ count: number }[]>`
    INSERT INTO "AuthRateBucket" ("key", "count", "expiresAt")
    VALUES (${key}, 1, NOW() + ${windowMs} * INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateBucket"."expiresAt" <= NOW() THEN 1 ELSE LEAST("AuthRateBucket"."count" + 1, ${limit + 1}) END,
      "expiresAt" = CASE WHEN "AuthRateBucket"."expiresAt" <= NOW() THEN NOW() + ${windowMs} * INTERVAL '1 millisecond' ELSE "AuthRateBucket"."expiresAt" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}
