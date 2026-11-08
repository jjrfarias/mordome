CREATE TYPE "OrderFulfillment" AS ENUM ('DELIVERY', 'PICKUP', 'DINE_IN');
ALTER TABLE "DeliveryOrder" ADD COLUMN "fulfillment" "OrderFulfillment" NOT NULL DEFAULT 'DELIVERY';
