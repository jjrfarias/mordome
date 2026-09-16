-- Áreas de entrega (ver ADR 0028)
CREATE TABLE "DeliveryArea" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "neighborhoods" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryArea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryArea_establishmentId_name_key" ON "DeliveryArea"("establishmentId", "name");

CREATE INDEX "DeliveryArea_establishmentId_active_idx" ON "DeliveryArea"("establishmentId", "active");

ALTER TABLE "DeliveryArea" ADD CONSTRAINT "DeliveryArea_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrder" ADD COLUMN "deliveryAreaId" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "deliveryFee" DECIMAL(10,2);

CREATE INDEX "DeliveryOrder_establishmentId_deliveryAreaId_idx" ON "DeliveryOrder"("establishmentId", "deliveryAreaId");

ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_deliveryAreaId_fkey" FOREIGN KEY ("deliveryAreaId") REFERENCES "DeliveryArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD COLUMN "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0;
