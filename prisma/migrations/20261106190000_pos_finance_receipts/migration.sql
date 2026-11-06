ALTER TABLE "Sale" ADD COLUMN "financeTracked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinancialEntry"
  ADD COLUMN "sourcePaymentId" TEXT,
  ADD COLUMN "sourceRefundPaymentId" TEXT,
  ADD COLUMN "reversalOfId" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "grossAmount" DECIMAL(12,2),
  ADD COLUMN "feeAmount" DECIMAL(12,2),
  ADD COLUMN "feeRateSnapshot" DECIMAL(5,2),
  ADD COLUMN "settlementDaysSnapshot" INTEGER,
  ADD COLUMN "sourceLabel" TEXT;
CREATE UNIQUE INDEX "FinancialEntry_sourcePaymentId_key" ON "FinancialEntry"("sourcePaymentId");
CREATE UNIQUE INDEX "FinancialEntry_sourceRefundPaymentId_key" ON "FinancialEntry"("sourceRefundPaymentId");
CREATE UNIQUE INDEX "FinancialEntry_reversalOfId_key" ON "FinancialEntry"("reversalOfId");
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_sourceRefundPaymentId_fkey" FOREIGN KEY ("sourceRefundPaymentId") REFERENCES "RefundPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancialEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_single_origin" CHECK (num_nonnulls("sourcePaymentId", "sourceRefundPaymentId", "reversalOfId") <= 1);
CREATE TABLE "PosReceiptRule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "name" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "feeRate" DECIMAL(5,2) NOT NULL,
  "settlementDays" INTEGER NOT NULL,
  "businessDays" BOOLEAN NOT NULL DEFAULT false,
  "holidays" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosReceiptRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PosReceiptRule_values" CHECK ("feeRate" >= 0 AND "feeRate" < 100 AND "settlementDays" BETWEEN 0 AND 365),
  CONSTRAINT "PosReceiptRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PosReceiptRule_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PosReceiptRule_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PosReceiptRule_establishmentId_method_key" ON "PosReceiptRule"("establishmentId", "method");
CREATE INDEX "PosReceiptRule_organizationId_establishmentId_idx" ON "PosReceiptRule"("organizationId", "establishmentId");
