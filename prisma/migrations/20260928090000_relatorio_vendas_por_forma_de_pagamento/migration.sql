INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_reports_payment_methods_view', 'reports.payment_methods.view', 'reports', 'Ver o relatório de Vendas por forma de pagamento')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('reports.payment_methods.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
