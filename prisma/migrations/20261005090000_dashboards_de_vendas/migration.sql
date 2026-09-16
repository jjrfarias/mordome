INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_dashboards_sales_tracking_view', 'dashboards.sales_tracking.view', 'dashboards', 'Ver o dashboard de Acompanhamento de vendas'),
  ('permission_dashboards_multi_store_tracking_view', 'dashboards.multi_store_tracking.view', 'dashboards', 'Ver o dashboard de Acompanhamento de vendas multilojas')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('dashboards.sales_tracking.view', 'dashboards.multi_store_tracking.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
