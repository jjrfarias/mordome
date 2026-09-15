INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_finance_cashflow_view', 'finance.cashflow.view', 'finance', 'Consultar o fluxo de caixa consolidado')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('finance.cashflow.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
