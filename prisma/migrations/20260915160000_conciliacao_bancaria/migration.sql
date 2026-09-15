ALTER TABLE "FinancialEntry"
  ADD COLUMN "reconciled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reconciledAt" TIMESTAMP(3),
  ADD COLUMN "reconciledById" TEXT;

CREATE INDEX "FinancialEntry_establishmentId_bankAccountId_status_paidAt_idx" ON "FinancialEntry"("establishmentId", "bankAccountId", "status", "paidAt");

ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
