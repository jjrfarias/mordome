-- Frentes de caixa (ver ADR 0048): terminais nomeados por estabelecimento, vínculo opcional em
-- CashSession — estabelecimentos sem frente cadastrada continuam abrindo caixa como antes.
CREATE TABLE "CashFront" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashFront_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashFront_establishmentId_name_key" ON "CashFront"("establishmentId", "name");

CREATE INDEX "CashFront_establishmentId_active_idx" ON "CashFront"("establishmentId", "active");

ALTER TABLE "CashFront" ADD CONSTRAINT "CashFront_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CashSession" ADD COLUMN "cashFrontId" TEXT;

CREATE INDEX "CashSession_cashFrontId_status_idx" ON "CashSession"("cashFrontId", "status");

-- Só uma sessão aberta por frente de caixa por vez (mesmo padrão da exclusividade por operador,
-- ver CashSession_establishmentId_openedById_open_key) — índice parcial: linhas com
-- "cashFrontId" nulo (frente não informada) nunca conflitam entre si.
CREATE UNIQUE INDEX "CashSession_cashFrontId_open_key" ON "CashSession"("cashFrontId") WHERE "status" = 'OPEN' AND "cashFrontId" IS NOT NULL;

ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cashFrontId_fkey" FOREIGN KEY ("cashFrontId") REFERENCES "CashFront"("id") ON DELETE SET NULL ON UPDATE CASCADE;
