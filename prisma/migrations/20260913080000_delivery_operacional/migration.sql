CREATE TYPE "DeliveryStatus" AS ENUM ('RECEIVED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
CREATE TYPE "DeliveryOrigin" AS ENUM ('INTERNAL', 'ONLINE');

CREATE TABLE "DeliveryOrder" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "destinationLat" DOUBLE PRECISION,
  "destinationLng" DOUBLE PRECISION,
  "notes" TEXT,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
  "origin" "DeliveryOrigin" NOT NULL DEFAULT 'INTERNAL',
  "courierId" TEXT,
  "saleId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeliveryOrder_saleId_key" ON "DeliveryOrder"("saleId");
CREATE INDEX "DeliveryOrder_establishmentId_status_idx" ON "DeliveryOrder"("establishmentId", "status");
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DeliveryOrderItem" (
  "id" TEXT NOT NULL,
  "deliveryOrderId" TEXT NOT NULL,
  "productId" TEXT,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "DeliveryOrderItem_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CourierLocation" (
  "courierId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourierLocation_pkey" PRIMARY KEY ("courierId")
);
ALTER TABLE "CourierLocation" ADD CONSTRAINT "CourierLocation_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_delivery_operate', 'delivery.operate', 'delivery', 'Operar pedidos de delivery e atribuir entregador'),
  ('permission_delivery_deliver', 'delivery.deliver', 'delivery', 'Ver as proprias entregas e compartilhar localizacao em rota')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('delivery.operate', 'delivery.deliver')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
