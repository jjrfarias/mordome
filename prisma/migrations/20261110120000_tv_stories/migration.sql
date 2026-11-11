CREATE TABLE "TvConfig" (
  "establishmentId" TEXT NOT NULL PRIMARY KEY,
  "brandName" TEXT,
  "slogan" TEXT NOT NULL DEFAULT '',
  "instagramHandle" TEXT NOT NULL DEFAULT '',
  "accentColor" TEXT,
  "imageDuration" INTEGER NOT NULL DEFAULT 8,
  "fit" TEXT NOT NULL DEFAULT 'contain',
  "source" TEXT NOT NULL DEFAULT 'all',
  "muted" BOOLEAN NOT NULL DEFAULT true,
  "instagramAccountId" TEXT,
  "instagramUsername" TEXT,
  "instagramAccessMode" TEXT,
  "instagramEncryptedToken" TEXT,
  "instagramConnectedAt" TIMESTAMP(3),
  "instagramLastAttemptAt" TIMESTAMP(3),
  "instagramSyncedAt" TIMESTAMP(3),
  "instagramRefreshLeaseUntil" TIMESTAMP(3),
  "instagramLastError" TEXT,
  "instagramStories" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TvConfig_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TvConfig_duration_check" CHECK ("imageDuration" BETWEEN 3 AND 60),
  CONSTRAINT "TvConfig_fit_check" CHECK ("fit" IN ('contain', 'cover')),
  CONSTRAINT "TvConfig_source_check" CHECK ("source" IN ('all', 'instagram', 'upload')),
  CONSTRAINT "TvConfig_accessMode_check" CHECK ("instagramAccessMode" IS NULL OR "instagramAccessMode" IN ('unified', 'facebook'))
);

CREATE TABLE "TvMedia" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "establishmentId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TvMedia_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TvMedia_size_check" CHECK ("size" > 0 AND "size" <= 31457280),
  CONSTRAINT "TvMedia_mimeType_check" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'))
);
CREATE UNIQUE INDEX "TvMedia_objectKey_key" ON "TvMedia"("objectKey");
CREATE INDEX "TvMedia_establishmentId_ready_createdAt_idx" ON "TvMedia"("establishmentId", "ready", "createdAt");

CREATE TABLE "TvStoryPreference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "establishmentId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TvStoryPreference_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TvStoryPreference_establishmentId_mediaId_key" ON "TvStoryPreference"("establishmentId", "mediaId");
CREATE INDEX "TvStoryPreference_establishmentId_expiresAt_idx" ON "TvStoryPreference"("establishmentId", "expiresAt");

CREATE TABLE "TvDisplay" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "establishmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  CONSTRAINT "TvDisplay_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TvDisplay_tokenHash_key" ON "TvDisplay"("tokenHash");
CREATE INDEX "TvDisplay_establishmentId_active_idx" ON "TvDisplay"("establishmentId", "active");
