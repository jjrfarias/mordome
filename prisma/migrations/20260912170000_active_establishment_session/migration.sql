ALTER TABLE "Session" ADD COLUMN "activeEstablishmentId" TEXT;

CREATE INDEX "Session_activeEstablishmentId_idx" ON "Session"("activeEstablishmentId");

ALTER TABLE "Session" ADD CONSTRAINT "Session_activeEstablishmentId_fkey"
FOREIGN KEY ("activeEstablishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
