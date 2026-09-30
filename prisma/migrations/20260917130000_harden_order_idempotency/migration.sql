-- Scope idempotency to the establishment so one tenant can never resolve
-- another tenant's sale, and make public online-order retries safe.
DROP INDEX IF EXISTS "Sale_idempotencyKey_key";
CREATE UNIQUE INDEX "Sale_establishmentId_idempotencyKey_key"
ON "Sale"("establishmentId", "idempotencyKey");

ALTER TABLE "DeliveryOrder" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "DeliveryOrder_establishmentId_clientRequestId_key"
ON "DeliveryOrder"("establishmentId", "clientRequestId");
