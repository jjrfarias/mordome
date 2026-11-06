ALTER TABLE "User" ADD COLUMN "email" TEXT,
 ADD COLUMN "emailVerifiedAt" TIMESTAMP(3), ADD COLUMN "pendingEmail" TEXT;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK ("email" IS NULL OR "email" = lower(btrim("email")));
ALTER TABLE "User" ADD CONSTRAINT "User_verified_email_present" CHECK ("emailVerifiedAt" IS NULL OR "email" IS NOT NULL);

CREATE TABLE "AccountSecurityToken" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "purpose" TEXT NOT NULL,
 "tokenHash" TEXT NOT NULL, "email" TEXT NOT NULL, "credentialHash" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AccountSecurityToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "AccountSecurityToken_purpose_check" CHECK ("purpose" IN ('RESET_PASSWORD', 'VERIFY_EMAIL'))
);
CREATE UNIQUE INDEX "AccountSecurityToken_tokenHash_key" ON "AccountSecurityToken"("tokenHash");
CREATE INDEX "AccountSecurityToken_userId_purpose_idx" ON "AccountSecurityToken"("userId", "purpose");
CREATE INDEX "AccountSecurityToken_expiresAt_idx" ON "AccountSecurityToken"("expiresAt");

CREATE TABLE "AccountSecurityEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "action" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AccountSecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AccountSecurityEvent_userId_createdAt_idx" ON "AccountSecurityEvent"("userId", "createdAt");

CREATE TABLE "AuthRateBucket" ("key" TEXT NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "AuthRateBucket_expiresAt_idx" ON "AuthRateBucket"("expiresAt");
