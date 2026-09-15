CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED');

CREATE TABLE "GoodsReceiptNote" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "supplierId" TEXT,
    "documentNumber" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "GoodsReceiptNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoodsReceiptItem" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "stockMovementId" TEXT,

    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoodsReceiptNote_establishmentId_status_receivedAt_idx" ON "GoodsReceiptNote"("establishmentId", "status", "receivedAt");

CREATE INDEX "GoodsReceiptNote_supplierId_idx" ON "GoodsReceiptNote"("supplierId");

CREATE UNIQUE INDEX "GoodsReceiptItem_stockMovementId_key" ON "GoodsReceiptItem"("stockMovementId");

CREATE INDEX "GoodsReceiptItem_noteId_idx" ON "GoodsReceiptItem"("noteId");

CREATE INDEX "GoodsReceiptItem_inventoryItemId_idx" ON "GoodsReceiptItem"("inventoryItemId");

ALTER TABLE "GoodsReceiptNote" ADD CONSTRAINT "GoodsReceiptNote_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptNote" ADD CONSTRAINT "GoodsReceiptNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptNote" ADD CONSTRAINT "GoodsReceiptNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "GoodsReceiptNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "EstablishmentInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
