BEGIN;

ALTER TABLE "DeliveryOrder" ADD COLUMN "accountInviteOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhatsAppConnection" ADD COLUMN "automation" JSONB;

CREATE TABLE "WhatsAppAutomationEvent" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppAutomationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppAutomationEvent_deliveryOrderId_event_key" ON "WhatsAppAutomationEvent"("deliveryOrderId", "event");
CREATE INDEX "WhatsAppAutomationEvent_establishmentId_createdAt_idx" ON "WhatsAppAutomationEvent"("establishmentId", "createdAt");

ALTER TABLE "WhatsAppAutomationEvent" ADD CONSTRAINT "WhatsAppAutomationEvent_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "DeliveryOrder_id_establishmentId_key" ON "DeliveryOrder"("id", "establishmentId");
ALTER TABLE "WhatsAppAutomationEvent" ADD CONSTRAINT "WhatsAppAutomationEvent_deliveryOrderId_establishmentId_fkey" FOREIGN KEY ("deliveryOrderId", "establishmentId") REFERENCES "DeliveryOrder"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
