-- AlterTable
ALTER TABLE "Product" ADD COLUMN "isCombo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ComboGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelections" INTEGER NOT NULL DEFAULT 1,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComboGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboGroupOption" (
    "id" TEXT NOT NULL,
    "comboGroupId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComboGroupOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComboGroup_productId_active_idx" ON "ComboGroup"("productId", "active");

-- CreateIndex
CREATE INDEX "ComboGroupOption_comboGroupId_active_idx" ON "ComboGroupOption"("comboGroupId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ComboGroupOption_comboGroupId_productId_key" ON "ComboGroupOption"("comboGroupId", "productId");

-- AddForeignKey
ALTER TABLE "ComboGroup" ADD CONSTRAINT "ComboGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboGroupOption" ADD CONSTRAINT "ComboGroupOption_comboGroupId_fkey" FOREIGN KEY ("comboGroupId") REFERENCES "ComboGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboGroupOption" ADD CONSTRAINT "ComboGroupOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
