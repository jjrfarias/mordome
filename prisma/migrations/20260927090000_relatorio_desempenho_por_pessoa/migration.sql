INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_reports_performance_by_staff_view', 'reports.performance_by_staff.view', 'reports', 'Ver o relatório de Desempenho por atendente/garçom')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('reports.performance_by_staff.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
