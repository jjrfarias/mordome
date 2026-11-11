ALTER TABLE "TvConfig"
ADD COLUMN "instagramTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "instagramClientBusinessId" TEXT,
ADD COLUMN "instagramSystemUserId" TEXT,
ADD COLUMN "instagramConfigId" TEXT,
ADD COLUMN "instagramReconnectRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "instagramTokenRefreshAttemptAt" TIMESTAMP(3);
CREATE TABLE "TvInstagramAuthorization" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stateHash" TEXT NOT NULL,
  "sessionHash" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "callbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "encryptedToken" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "clientBusinessId" TEXT,
  "systemUserId" TEXT,
  "configId" TEXT NOT NULL,
  "accounts" JSONB NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX "TvInstagramAuthorization_stateHash_key" ON "TvInstagramAuthorization"("stateHash");
CREATE UNIQUE INDEX "TvInstagramAuthorization_establishmentId_key" ON "TvInstagramAuthorization"("establishmentId");
CREATE INDEX "TvInstagramAuthorization_expiresAt_idx" ON "TvInstagramAuthorization"("expiresAt");
