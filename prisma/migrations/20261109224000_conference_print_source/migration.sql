ALTER TABLE "KitchenPrintJob" ADD COLUMN "conferenceTabId" TEXT;
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_conferenceTabId_fkey" FOREIGN KEY ("conferenceTabId") REFERENCES "Tab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "KitchenPrintJob_conferenceTabId_idx" ON "KitchenPrintJob"("conferenceTabId");
ALTER TABLE "KitchenPrintJob" DROP CONSTRAINT "KitchenPrintJob_one_source";
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_one_source" CHECK (num_nonnulls("orderId", "saleId", "conferenceTabId") = 1);
