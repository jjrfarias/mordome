-- Create the establishment-management permission used by the system owner role.
INSERT INTO "Permission" ("id", "key", "module", "description")
VALUES ('permission_establishments_manage', 'establishments.manage', 'establishments', 'Gerenciar estabelecimentos da organização')
ON CONFLICT ("key") DO UPDATE
SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

-- Existing organizations predate owner profiles. Create one system role per organization.
INSERT INTO "CustomRole" ("id", "organizationId", "name", "description", "systemTemplate", "active", "createdAt", "updatedAt")
SELECT 'owner-role-' || organization."id", organization."id", 'Proprietário', 'Responsável principal pela organização', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" organization
ON CONFLICT ("organizationId", "name") DO UPDATE
SET "description" = EXCLUDED."description", "systemTemplate" = true, "active" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "CustomRole" role
JOIN "Permission" permission ON permission."key" = 'establishments.manage'
WHERE role."name" = 'Proprietário' AND role."systemTemplate" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Bootstrap the oldest active membership as owner for organizations created before this permission existed.
WITH first_membership AS (
  SELECT DISTINCT ON (membership."organizationId") membership."id", membership."organizationId"
  FROM "OrganizationMembership" membership
  WHERE membership."status" = 'ACTIVE'
  ORDER BY membership."organizationId", membership."createdAt" ASC, membership."id" ASC
)
INSERT INTO "MembershipRole" ("membershipId", "roleId")
SELECT first_membership."id", role."id"
FROM first_membership
JOIN "CustomRole" role ON role."organizationId" = first_membership."organizationId"
WHERE role."name" = 'Proprietário' AND role."systemTemplate" = true
ON CONFLICT ("membershipId", "roleId") DO NOTHING;
