CREATE TYPE "CashMovementType" AS ENUM ('SUPPLY', 'WITHDRAWAL');

ALTER TABLE "CashSession"
  ADD COLUMN "expectedClosingAmount" DECIMAL(12,2),
  ADD COLUMN "differenceAmount" DECIMAL(12,2),
  ADD COLUMN "closingBreakdown" JSONB;

CREATE TABLE "CashMovement" (
  "id" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "type" "CashMovementType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashMovement_idempotencyKey_key" ON "CashMovement"("idempotencyKey");
CREATE INDEX "CashMovement_cashSessionId_createdAt_idx" ON "CashMovement"("cashSessionId", "createdAt");
CREATE UNIQUE INDEX "CashSession_establishmentId_openedById_open_key" ON "CashSession"("establishmentId", "openedById") WHERE "status" = 'OPEN';
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_cash_open', 'cash.open', 'cash', 'Abrir caixa'),
  ('permission_cash_move', 'cash.move', 'cash', 'Registrar suprimento e sangria'),
  ('permission_cash_close', 'cash.close', 'cash', 'Fechar e conferir caixa'),
  ('permission_cash_history_view', 'cash.history.view', 'cash', 'Consultar histórico de caixa')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "CustomRole" role CROSS JOIN "Permission" permission
WHERE role."name" = 'Proprietário' AND role."systemTemplate" = true
  AND permission."key" IN ('cash.open', 'cash.move', 'cash.close', 'cash.history.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
