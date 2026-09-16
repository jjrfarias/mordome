INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_reports_sales_by_delivery_area_view', 'reports.sales_by_delivery_area.view', 'reports', 'Ver o relatório de Vendas por área de entrega')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('reports.sales_by_delivery_area.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
