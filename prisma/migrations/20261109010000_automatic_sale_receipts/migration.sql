ALTER TABLE "KitchenPrintAgent" ADD COLUMN "receiptsActivatedAt" TIMESTAMP(3);
ALTER TABLE "KitchenPrintJob" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "KitchenPrintJob" ADD COLUMN "saleId" TEXT;
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "KitchenPrintJob_agentId_saleId_key" ON "KitchenPrintJob"("agentId", "saleId");
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_one_source" CHECK (("orderId" IS NOT NULL)::int + ("saleId" IS NOT NULL)::int = 1);
