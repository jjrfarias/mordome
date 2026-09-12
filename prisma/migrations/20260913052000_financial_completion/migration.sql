ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SALE_REFUND';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STOCK_ADJUST';
ALTER TABLE "SaleItem" ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "receivedAmount" DECIMAL(12,2), ADD COLUMN "changeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
CREATE TABLE "Refund" ("id" TEXT NOT NULL, "saleId" TEXT NOT NULL, "cashSessionId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "amount" DECIMAL(12,2) NOT NULL, "restoreStock" BOOLEAN NOT NULL DEFAULT false, "reason" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"));
CREATE TABLE "RefundPayment" ("id" TEXT NOT NULL, "refundId" TEXT NOT NULL, "method" "PaymentMethod" NOT NULL, "amount" DECIMAL(12,2) NOT NULL, CONSTRAINT "RefundPayment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
CREATE INDEX "Refund_saleId_createdAt_idx" ON "Refund"("saleId", "createdAt");
CREATE INDEX "Refund_cashSessionId_createdAt_idx" ON "Refund"("cashSessionId", "createdAt");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundPayment" ADD CONSTRAINT "RefundPayment_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
 ('permission_stock_adjust', 'stock.adjust', 'stock', 'Registrar perdas, consumo interno e inventário físico'),
 ('permission_discount_apply', 'discount.apply', 'sales', 'Aplicar desconto de até 10%'),
 ('permission_discount_override', 'discount.override', 'sales', 'Autorizar desconto acima de 10%'),
 ('permission_sale_refund', 'sale.refund', 'sales', 'Registrar reembolso total ou parcial')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('stock.adjust', 'discount.apply', 'discount.override', 'sale.refund')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
