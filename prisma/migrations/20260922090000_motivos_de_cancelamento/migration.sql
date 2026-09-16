-- Motivos pré-definidos de cancelamento/reembolso (ver ADR 0029)
CREATE TYPE "CancellationReasonCategory" AS ENUM ('SALE_CANCEL', 'ITEM_CANCEL', 'REFUND');

CREATE TABLE "CancellationReason" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" "CancellationReasonCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationReason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CancellationReason_organizationId_category_label_key" ON "CancellationReason"("organizationId", "category", "label");

CREATE INDEX "CancellationReason_organizationId_category_active_idx" ON "CancellationReason"("organizationId", "category", "active");

ALTER TABLE "CancellationReason" ADD CONSTRAINT "CancellationReason_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
