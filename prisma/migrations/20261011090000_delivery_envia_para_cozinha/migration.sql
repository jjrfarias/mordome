-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN "kitchenOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_kitchenOrderId_key" ON "DeliveryOrder"("kitchenOrderId");
