BEGIN;
-- DropForeignKey

-- CreateTable
CREATE TABLE "CustomerAccountEvent" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAccountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerAccountEvent_establishmentId_accountId_createdAt_idx" ON "CustomerAccountEvent"("establishmentId", "accountId", "createdAt");

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "CustomerAccountEvent" ADD CONSTRAINT "CustomerAccountEvent_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountEvent" ADD CONSTRAINT "CustomerAccountEvent_accountId_establishmentId_fkey" FOREIGN KEY ("accountId", "establishmentId") REFERENCES "CustomerAccount"("id", "establishmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
