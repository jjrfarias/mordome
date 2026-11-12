ALTER TABLE "DeliveryOrder" ADD COLUMN "publicSessionHash" TEXT;
CREATE INDEX "DeliveryOrder_establishmentId_publicSessionHash_createdAt_idx" ON "DeliveryOrder"("establishmentId", "publicSessionHash", "createdAt");
CREATE TABLE "PublicOrderAddition" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicOrderAddition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PublicOrderAddition_establishmentId_clientRequestId_key" ON "PublicOrderAddition"("establishmentId", "clientRequestId");
ALTER TABLE "PublicOrderAddition" ADD CONSTRAINT "PublicOrderAddition_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
