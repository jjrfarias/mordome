ALTER TABLE "Sale" ALTER COLUMN "cashSessionId" DROP NOT NULL;
ALTER TABLE "Sale" ADD COLUMN "idempotencyKey" TEXT;
UPDATE "Sale" SET "idempotencyKey" = 'legacy:' || "id" WHERE "idempotencyKey" IS NULL;
ALTER TABLE "Sale" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "Sale_idempotencyKey_key" ON "Sale"("idempotencyKey");
ALTER TABLE "SaleItem" ADD COLUMN "recipeSnapshot" JSONB;

INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_pos_sell', 'pos.sell', 'pos', 'Realizar vendas no PDV'),
  ('permission_floor_operate', 'floor.operate', 'floor', 'Operar salão e fechar comandas')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "CustomRole" role
CROSS JOIN "Permission" permission
WHERE role."name" = 'Proprietário' AND role."systemTemplate" = true
  AND permission."key" IN ('pos.sell', 'floor.operate')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
