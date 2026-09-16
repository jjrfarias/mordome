CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "desiredQuantity" DECIMAL(14,3) NOT NULL,
    "notes" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShoppingListItem_establishmentId_resolved_idx" ON "ShoppingListItem"("establishmentId", "resolved");

CREATE INDEX "ShoppingListItem_inventoryItemId_idx" ON "ShoppingListItem"("inventoryItemId");

ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "EstablishmentInventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
