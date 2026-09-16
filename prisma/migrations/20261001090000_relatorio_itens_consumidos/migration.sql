INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_reports_items_consumed_view', 'reports.items_consumed.view', 'reports', 'Ver o relatório de Itens consumidos')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('reports.items_consumed.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
