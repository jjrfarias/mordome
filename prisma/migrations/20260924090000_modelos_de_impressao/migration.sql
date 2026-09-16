-- Modelos de impressão (ver ADR 0031): um template de aparência do recibo por estabelecimento.
CREATE TABLE "PrintTemplate" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "headerText" TEXT,
    "footerText" TEXT,
    "showDocument" BOOLEAN NOT NULL DEFAULT false,
    "paperWidth" INTEGER NOT NULL DEFAULT 80,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrintTemplate_establishmentId_key" ON "PrintTemplate"("establishmentId");

ALTER TABLE "PrintTemplate" ADD CONSTRAINT "PrintTemplate_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
