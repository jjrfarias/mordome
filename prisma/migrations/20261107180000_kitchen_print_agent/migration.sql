CREATE TABLE "KitchenPrintAgent" (
 "id" TEXT NOT NULL PRIMARY KEY, "establishmentId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
 "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" TIMESTAMP(3),
 CONSTRAINT "KitchenPrintAgent_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KitchenPrintAgent_tokenHash_key" ON "KitchenPrintAgent"("tokenHash");
CREATE INDEX "KitchenPrintAgent_establishmentId_active_idx" ON "KitchenPrintAgent"("establishmentId", "active");
CREATE TABLE "KitchenPrintJob" (
 "id" TEXT NOT NULL PRIMARY KEY, "agentId" TEXT NOT NULL, "orderId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "payload" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "KitchenPrintJob_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "KitchenPrintAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "KitchenPrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KitchenPrintJob_agentId_orderId_key" ON "KitchenPrintJob"("agentId", "orderId");
CREATE INDEX "KitchenPrintJob_agentId_status_createdAt_idx" ON "KitchenPrintJob"("agentId", "status", "createdAt");
