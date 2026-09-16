INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_reports_coupons_generated_view', 'reports.coupons_generated.view', 'reports', 'Ver o relatório de Cupons gerados')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('reports.coupons_generated.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
