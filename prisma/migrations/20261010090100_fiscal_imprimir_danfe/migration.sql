-- Opção por unidade (ver ADR 0049, adendo): imprimir o DANFE-NFC-e no lugar do recibo comum.
ALTER TABLE "FiscalConfig" ADD COLUMN "printDanfe" BOOLEAN NOT NULL DEFAULT false;
