ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TAB_ITEM_CANCEL';

CREATE TABLE "OrderItemCancellation" (
  "id" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity" DECIMAL(10,3) NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderItemCancellation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderItemCancellation_orderItemId_createdAt_idx" ON "OrderItemCancellation"("orderItemId", "createdAt");
CREATE INDEX "OrderItemCancellation_actorId_createdAt_idx" ON "OrderItemCancellation"("actorId", "createdAt");
ALTER TABLE "OrderItemCancellation" ADD CONSTRAINT "OrderItemCancellation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItemCancellation" ADD CONSTRAINT "OrderItemCancellation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_tabs_cancel_item', 'tabs.cancel_item', 'floor', 'Cancelar itens já enviados à cozinha'),
  ('permission_pos_cancel_sale', 'pos.cancel_sale', 'pos', 'Cancelar vendas concluídas enquanto o caixa original está aberto')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."systemTemplate" = true AND permission."key" IN ('tabs.cancel_item', 'pos.cancel_sale')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
