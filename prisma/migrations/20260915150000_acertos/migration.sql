CREATE TYPE "SettlementRole" AS ENUM ('COURIER', 'WAITER');

CREATE TABLE "UserCommissionRule" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "SettlementRole" NOT NULL,
  "amountPerDelivery" DECIMAL(12,2),
  "percentOfSales" DECIMAL(5,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserCommissionRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserCommissionRule_establishmentId_userId_role_key" ON "UserCommissionRule"("establishmentId", "userId", "role");
CREATE INDEX "UserCommissionRule_establishmentId_role_idx" ON "UserCommissionRule"("establishmentId", "role");
ALTER TABLE "UserCommissionRule" ADD CONSTRAINT "UserCommissionRule_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCommissionRule" ADD CONSTRAINT "UserCommissionRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SettlementRecord" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "SettlementRole" NOT NULL,
  "from" TIMESTAMP(3) NOT NULL,
  "to" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "SettlementRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SettlementRecord_establishmentId_userId_role_from_to_key" ON "SettlementRecord"("establishmentId", "userId", "role", "from", "to");
CREATE INDEX "SettlementRecord_establishmentId_role_paidAt_idx" ON "SettlementRecord"("establishmentId", "role", "paidAt");
CREATE INDEX "SettlementRecord_userId_idx" ON "SettlementRecord"("userId");
ALTER TABLE "SettlementRecord" ADD CONSTRAINT "SettlementRecord_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementRecord" ADD CONSTRAINT "SettlementRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementRecord" ADD CONSTRAINT "SettlementRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_settlements_manage', 'settlements.manage', 'finance', 'Configurar comissões e registrar acertos pagos de entregadores e garçons')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('settlements.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
