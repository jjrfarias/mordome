-- Fundação fiscal — emissão de NFC-e (ver ADR 0049).
CREATE TYPE "FiscalTaxRegime" AS ENUM ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');
CREATE TYPE "FiscalEnvironment" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REJECTED', 'CANCELLED', 'ERROR');

ALTER TABLE "Product" ADD COLUMN "ncm" TEXT;
ALTER TABLE "Product" ADD COLUMN "cfop" TEXT;
ALTER TABLE "Product" ADD COLUMN "icmsCst" TEXT;
ALTER TABLE "Product" ADD COLUMN "icmsOrigin" TEXT;
ALTER TABLE "Product" ADD COLUMN "unitOfMeasure" TEXT;

CREATE TABLE "FiscalConfig" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'FOCUS_NFE',
    "providerApiToken" TEXT,
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'HOMOLOGACAO',
    "stateRegistration" TEXT,
    "taxRegime" "FiscalTaxRegime",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalConfig_establishmentId_key" ON "FiscalConfig"("establishmentId");

ALTER TABLE "FiscalConfig" ADD CONSTRAINT "FiscalConfig_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "environment" "FiscalEnvironment" NOT NULL,
    "accessKey" TEXT,
    "number" TEXT,
    "series" TEXT,
    "statusMessage" TEXT,
    "danfeUrl" TEXT,
    "qrCodeUrl" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalDocument_saleId_key" ON "FiscalDocument"("saleId");

CREATE INDEX "FiscalDocument_establishmentId_status_idx" ON "FiscalDocument"("establishmentId", "status");

ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_fiscal_manage', 'fiscal.manage', 'fiscal', 'Gerenciar configuração fiscal, dados fiscais dos produtos e notas fiscais emitidas')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('fiscal.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
