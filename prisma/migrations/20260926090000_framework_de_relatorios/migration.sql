INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_reports_sales_by_period_view', 'reports.sales_by_period.view', 'reports', 'Ver o relatório de Vendas por período'),
  ('permission_reports_revenue_by_day_view', 'reports.revenue_by_day.view', 'reports', 'Ver o relatório de Faturamento por dia')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('reports.sales_by_period.view', 'reports.revenue_by_day.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
