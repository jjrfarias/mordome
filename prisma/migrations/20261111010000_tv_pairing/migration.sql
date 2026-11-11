CREATE TABLE "TvPairing" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "displayId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TvPairing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TvPairing_codeHash_key" ON "TvPairing"("codeHash");
CREATE UNIQUE INDEX "TvPairing_deviceHash_key" ON "TvPairing"("deviceHash");
CREATE INDEX "TvPairing_expiresAt_idx" ON "TvPairing"("expiresAt");
