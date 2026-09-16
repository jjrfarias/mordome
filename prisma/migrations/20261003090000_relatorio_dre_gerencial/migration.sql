INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_reports_dre_view', 'reports.dre.view', 'reports', 'Ver o relatório de DRE Gerencial')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('reports.dre.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
