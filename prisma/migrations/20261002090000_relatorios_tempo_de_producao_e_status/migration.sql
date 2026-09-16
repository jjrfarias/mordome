INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_reports_production_time_view', 'reports.production_time.view', 'reports', 'Ver o relatório de Tempo de produção'),
  ('permission_reports_time_by_status_view', 'reports.time_by_status.view', 'reports', 'Ver o relatório de Tempo por status')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('reports.production_time.view', 'reports.time_by_status.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
