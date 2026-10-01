BEGIN;

ALTER TABLE "WhatsAppConnection" ADD COLUMN "orderingEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WhatsAppOrderingSession" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppOrderingSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppOrderingSession_establishmentId_phone_key" ON "WhatsAppOrderingSession"("establishmentId", "phone");
CREATE INDEX "WhatsAppOrderingSession_establishmentId_expiresAt_idx" ON "WhatsAppOrderingSession"("establishmentId", "expiresAt");
ALTER TABLE "WhatsAppOrderingSession" ADD CONSTRAINT "WhatsAppOrderingSession_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppInboundReceipt" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppInboundReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppInboundReceipt_establishmentId_messageId_key" ON "WhatsAppInboundReceipt"("establishmentId", "messageId");
CREATE INDEX "WhatsAppInboundReceipt_establishmentId_expiresAt_idx" ON "WhatsAppInboundReceipt"("establishmentId", "expiresAt");
ALTER TABLE "WhatsAppInboundReceipt" ADD CONSTRAINT "WhatsAppInboundReceipt_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;