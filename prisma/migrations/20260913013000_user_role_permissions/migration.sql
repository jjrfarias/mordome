INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_finance_summary_view', 'finance.summary.view', 'finance', 'Consultar o resumo financeiro'),
  ('permission_users_view', 'users.view', 'users', 'Consultar usuários e seus acessos'),
  ('permission_users_invite', 'users.invite', 'users', 'Criar usuários e conceder acesso inicial'),
  ('permission_users_disable', 'users.disable', 'users', 'Suspender e reativar usuários'),
  ('permission_users_password_reset', 'users.password.reset', 'users', 'Redefinir a senha de usuários'),
  ('permission_roles_manage', 'roles.manage', 'roles', 'Criar e alterar perfis de permissão')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true
  AND permission."key" IN ('finance.summary.view', 'users.view', 'users.invite', 'users.disable', 'users.password.reset', 'roles.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
