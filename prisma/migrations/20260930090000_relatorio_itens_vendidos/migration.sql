INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_reports_items_sold_view', 'reports.items_sold.view', 'reports', 'Ver o relatório de Itens vendidos')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('reports.items_sold.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
