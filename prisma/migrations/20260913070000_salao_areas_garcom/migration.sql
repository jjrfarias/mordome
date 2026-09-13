ALTER TABLE "DiningTable" ADD COLUMN "area" TEXT, ADD COLUMN "assignedWaiterId" TEXT;
CREATE INDEX "DiningTable_establishmentId_area_idx" ON "DiningTable"("establishmentId", "area");
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_assignedWaiterId_fkey" FOREIGN KEY ("assignedWaiterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_floor_manage', 'floor.manage', 'floor', 'Configurar mesas, areas e garcom responsavel no salao')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('floor.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
