INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_dashboards_channels_view', 'dashboards.channels.view', 'dashboards', 'Ver o dashboard de Canais'),
  ('permission_dashboards_sales_by_hour_view', 'dashboards.sales_by_hour.view', 'dashboards', 'Ver o dashboard de Vendas por Data/Hora')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('dashboards.channels.view', 'dashboards.sales_by_hour.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
