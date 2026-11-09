ALTER TABLE "Sale" ADD COLUMN "serviceWaived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "deliveryParentId" TEXT;
ALTER TABLE "Order" ADD COLUMN "amendmentKey" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryParentId_fkey" FOREIGN KEY ("deliveryParentId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Order_deliveryParentId_amendmentKey_key" ON "Order"("deliveryParentId", "amendmentKey");
