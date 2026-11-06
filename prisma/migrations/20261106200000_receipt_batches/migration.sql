-- CreateEnum
CREATE TYPE "ReceiptBatchStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- AlterTable
ALTER TABLE "FinancialEntry" ADD COLUMN     "isReceiptBatchAdjustment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receiptBatchId" TEXT;

-- CreateTable
CREATE TABLE "ReceiptBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "receivedAmount" DECIMAL(12,2) NOT NULL,
    "differenceAmount" DECIMAL(12,2) NOT NULL,
    "receivedDate" DATE NOT NULL,
    "reason" TEXT,
    "status" "ReceiptBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "ReceiptBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "previousStatus" "FinancialEntryStatus" NOT NULL,
    "previousPaidAt" TIMESTAMP(3),
    "previousBankAccountId" TEXT,

    CONSTRAINT "ReceiptBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptBatch_idempotencyKey_key" ON "ReceiptBatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ReceiptBatch_organizationId_establishmentId_receivedDate_idx" ON "ReceiptBatch"("organizationId", "establishmentId", "receivedDate");

-- CreateIndex
CREATE INDEX "ReceiptBatch_bankAccountId_receivedDate_idx" ON "ReceiptBatch"("bankAccountId", "receivedDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptBatch_id_organizationId_establishmentId_key" ON "ReceiptBatch"("id", "organizationId", "establishmentId");

-- CreateIndex
CREATE INDEX "ReceiptBatchItem_entryId_organizationId_establishmentId_idx" ON "ReceiptBatchItem"("entryId", "organizationId", "establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptBatchItem_batchId_entryId_key" ON "ReceiptBatchItem"("batchId", "entryId");

-- CreateIndex
CREATE INDEX "FinancialEntry_receiptBatchId_idx" ON "FinancialEntry"("receiptBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEntry_id_organizationId_establishmentId_key" ON "FinancialEntry"("id", "organizationId", "establishmentId");

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_receiptBatchId_fkey" FOREIGN KEY ("receiptBatchId") REFERENCES "ReceiptBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptBatch" ADD CONSTRAINT "ReceiptBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptBatch" ADD CONSTRAINT "ReceiptBatch_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptBatch" ADD CONSTRAINT "ReceiptBatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptBatch" ADD CONSTRAINT "ReceiptBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptBatch" ADD CONSTRAINT "ReceiptBatch_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptBatchItem" ADD CONSTRAINT "ReceiptBatchItem_batchId_organizationId_establishmentId_fkey" FOREIGN KEY ("batchId", "organizationId", "establishmentId") REFERENCES "ReceiptBatch"("id", "organizationId", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptBatchItem" ADD CONSTRAINT "ReceiptBatchItem_entryId_organizationId_establishmentId_fkey" FOREIGN KEY ("entryId", "organizationId", "establishmentId") REFERENCES "FinancialEntry"("id", "organizationId", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReceiptBatch" ADD CONSTRAINT "ReceiptBatch_amounts" CHECK ("expectedAmount" >= 0 AND "receivedAmount" >= 0 AND "differenceAmount" = "receivedAmount" - "expectedAmount");
CREATE TRIGGER "ReceiptBatch_scope" BEFORE INSERT OR UPDATE ON "ReceiptBatch" FOR EACH ROW EXECUTE FUNCTION validate_pos_finance_scope();
CREATE UNIQUE INDEX "FinancialEntry_one_batch_adjustment" ON "FinancialEntry"("receiptBatchId") WHERE "isReceiptBatchAdjustment" = true;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_batch_adjustment" CHECK (NOT "isReceiptBatchAdjustment" OR ("receiptBatchId" IS NOT NULL AND "sourcePaymentId" IS NULL AND "sourceRefundPaymentId" IS NULL AND "reversalOfId" IS NULL));
CREATE FUNCTION validate_receipt_batch_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."receiptBatchId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ReceiptBatch" b WHERE b.id = NEW."receiptBatchId" AND b."organizationId" = NEW."organizationId" AND b."establishmentId" = NEW."establishmentId" AND b."bankAccountId" = NEW."bankAccountId") THEN
  RAISE EXCEPTION 'Invalid receipt batch scope';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "FinancialEntry_batch_scope" BEFORE INSERT OR UPDATE ON "FinancialEntry" FOR EACH ROW EXECUTE FUNCTION validate_receipt_batch_scope();
