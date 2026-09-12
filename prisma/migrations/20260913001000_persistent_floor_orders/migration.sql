CREATE TYPE "TabStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED');
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TAB_CLOSE';

CREATE TABLE "DiningTable" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 4,
  "name" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tab" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "openedById" TEXT NOT NULL,
  "saleId" TEXT,
  "status" "TabStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "Tab_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TabItem" (
  "id" TEXT NOT NULL,
  "tabId" TEXT NOT NULL,
  "productId" TEXT,
  "productName" TEXT NOT NULL,
  "quantity" DECIMAL(10,3) NOT NULL,
  "sentQuantity" DECIMAL(10,3) NOT NULL DEFAULT 0,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "addedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TabItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "tabId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
  "sentById" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "tabItemId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" DECIMAL(10,3) NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderStatusHistory" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiningTable_establishmentId_number_key" ON "DiningTable"("establishmentId", "number");
CREATE INDEX "DiningTable_establishmentId_active_number_idx" ON "DiningTable"("establishmentId", "active", "number");
CREATE UNIQUE INDEX "Tab_saleId_key" ON "Tab"("saleId");
CREATE INDEX "Tab_establishmentId_status_openedAt_idx" ON "Tab"("establishmentId", "status", "openedAt");
CREATE INDEX "Tab_tableId_status_idx" ON "Tab"("tableId", "status");
CREATE UNIQUE INDEX "Tab_tableId_open_key" ON "Tab"("tableId") WHERE "status" = 'OPEN';
CREATE INDEX "TabItem_tabId_active_idx" ON "TabItem"("tabId", "active");
CREATE INDEX "TabItem_productId_idx" ON "TabItem"("productId");
CREATE INDEX "Order_tabId_sentAt_idx" ON "Order"("tabId", "sentAt");
CREATE INDEX "Order_status_sentAt_idx" ON "Order"("status", "sentAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tab" ADD CONSTRAINT "Tab_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tab" ADD CONSTRAINT "Tab_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tab" ADD CONSTRAINT "Tab_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tab" ADD CONSTRAINT "Tab_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TabItem" ADD CONSTRAINT "TabItem_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "Tab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TabItem" ADD CONSTRAINT "TabItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TabItem" ADD CONSTRAINT "TabItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "Tab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tabItemId_fkey" FOREIGN KEY ("tabItemId") REFERENCES "TabItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "DiningTable" ("id", "establishmentId", "number", "seats", "updatedAt")
SELECT 'table_' || md5(establishment."id" || ':' || series.number::text), establishment."id", series.number, 4, CURRENT_TIMESTAMP
FROM "Establishment" establishment
CROSS JOIN generate_series(1, 12) AS series(number)
ON CONFLICT ("establishmentId", "number") DO NOTHING;
