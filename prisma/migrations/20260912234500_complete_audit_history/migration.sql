ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGOUT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ESTABLISHMENT_SWITCH';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STOCK_ENTRY';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STOCK_CONFIGURE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TAB_OPEN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TAB_ITEM_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_SENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_STATUS_CHANGE';

ALTER TABLE "AuditEvent" ADD COLUMN "userAgent" TEXT;
CREATE INDEX "AuditEvent_organizationId_actorId_createdAt_idx" ON "AuditEvent"("organizationId", "actorId", "createdAt");
CREATE INDEX "AuditEvent_organizationId_action_createdAt_idx" ON "AuditEvent"("organizationId", "action", "createdAt");

INSERT INTO "Permission" ("id", "key", "module", "description")
VALUES ('perm_audit_view', 'audit.view', 'audit', 'Visualizar o histórico completo e auditável da organização')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "CustomRole" role
JOIN "Permission" permission ON permission."key" = 'audit.view'
WHERE role."system" = TRUE AND role."name" = 'Proprietário'
ON CONFLICT DO NOTHING;
