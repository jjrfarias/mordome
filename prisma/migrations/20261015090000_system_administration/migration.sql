CREATE TABLE "SystemAdmin" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemAdmin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemAdminSession" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "SystemAdminSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformAuditEvent" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemAdmin_username_key" ON "SystemAdmin"("username");
CREATE UNIQUE INDEX "SystemAdminSession_tokenHash_key" ON "SystemAdminSession"("tokenHash");
CREATE INDEX "SystemAdminSession_adminId_expiresAt_idx" ON "SystemAdminSession"("adminId", "expiresAt");
CREATE INDEX "SystemAdminSession_expiresAt_idx" ON "SystemAdminSession"("expiresAt");
CREATE INDEX "PlatformAuditEvent_adminId_createdAt_idx" ON "PlatformAuditEvent"("adminId", "createdAt");
CREATE INDEX "PlatformAuditEvent_entityType_entityId_createdAt_idx" ON "PlatformAuditEvent"("entityType", "entityId", "createdAt");
ALTER TABLE "SystemAdminSession" ADD CONSTRAINT "SystemAdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "SystemAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformAuditEvent" ADD CONSTRAINT "PlatformAuditEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "SystemAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
