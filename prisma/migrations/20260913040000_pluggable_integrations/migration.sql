CREATE TYPE "IntegrationCategory" AS ENUM ('PRINTER', 'PAYMENT', 'SCALE');

CREATE TABLE "EstablishmentIntegration" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "category" "IntegrationCategory" NOT NULL,
  "driver" TEXT NOT NULL,
  "config" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EstablishmentIntegration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EstablishmentIntegration_establishmentId_category_key" ON "EstablishmentIntegration"("establishmentId", "category");
ALTER TABLE "EstablishmentIntegration" ADD CONSTRAINT "EstablishmentIntegration_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_integrations_manage', 'integrations.manage', 'integrations', 'Configurar impressoras, maquinas de cartao e balancas')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('integrations.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
