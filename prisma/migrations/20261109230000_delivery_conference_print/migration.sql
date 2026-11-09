ALTER TABLE "KitchenPrintJob" ADD COLUMN "conferenceDeliveryOrderId" TEXT;
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_conferenceDeliveryOrderId_fkey" FOREIGN KEY ("conferenceDeliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "KitchenPrintJob_conferenceDeliveryOrderId_idx" ON "KitchenPrintJob"("conferenceDeliveryOrderId");
ALTER TABLE "KitchenPrintJob" DROP CONSTRAINT "KitchenPrintJob_one_source";
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_one_source" CHECK (num_nonnulls("orderId", "saleId", "conferenceTabId", "conferenceDeliveryOrderId") = 1);
