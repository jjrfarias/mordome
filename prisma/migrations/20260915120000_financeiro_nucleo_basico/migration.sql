CREATE TYPE "FinancialCategoryKind" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "FinancialEntryStatus" AS ENUM ('PENDING', 'PAID');

CREATE TABLE "FinancialCategory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "FinancialCategoryKind" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialCategory_organizationId_name_kind_key" ON "FinancialCategory"("organizationId", "name", "kind");
CREATE INDEX "FinancialCategory_organizationId_active_idx" ON "FinancialCategory"("organizationId", "active");
ALTER TABLE "FinancialCategory" ADD CONSTRAINT "FinancialCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BankAccount" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bank" TEXT NOT NULL,
  "agency" TEXT,
  "accountNumber" TEXT,
  "initialBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankAccount_establishmentId_name_key" ON "BankAccount"("establishmentId", "name");
CREATE INDEX "BankAccount_establishmentId_active_idx" ON "BankAccount"("establishmentId", "active");
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PaymentMethodConfig" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "feeRate" DECIMAL(5,2),
  "settlementDays" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentMethodConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentMethodConfig_establishmentId_name_key" ON "PaymentMethodConfig"("establishmentId", "name");
CREATE INDEX "PaymentMethodConfig_establishmentId_active_idx" ON "PaymentMethodConfig"("establishmentId", "active");
ALTER TABLE "PaymentMethodConfig" ADD CONSTRAINT "PaymentMethodConfig_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FinancialEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "bankAccountId" TEXT,
  "paymentMethodId" TEXT,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "status" "FinancialEntryStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FinancialEntry_establishmentId_status_dueDate_idx" ON "FinancialEntry"("establishmentId", "status", "dueDate");
CREATE INDEX "FinancialEntry_organizationId_status_dueDate_idx" ON "FinancialEntry"("organizationId", "status", "dueDate");
CREATE INDEX "FinancialEntry_categoryId_idx" ON "FinancialEntry"("categoryId");
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethodConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_finance_manage', 'finance.manage', 'finance', 'Gerenciar categorias, contas bancarias e formas de pagamento financeiras'),
  ('permission_finance_entries_manage', 'finance.entries.manage', 'finance', 'Lancar, editar e baixar contas a pagar e a receber')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('finance.manage', 'finance.entries.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
