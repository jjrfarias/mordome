ALTER TABLE "TvConfig" ADD COLUMN "guestCode" TEXT, ADD COLUMN "guestUploadsEnabled" BOOLEAN NOT NULL DEFAULT true;
UPDATE "TvConfig" SET "guestCode" = replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "TvConfig" ALTER COLUMN "guestCode" SET NOT NULL;
CREATE UNIQUE INDEX "TvConfig_guestCode_key" ON "TvConfig"("guestCode");
ALTER TABLE "TvMedia" ADD COLUMN "guestSubmission" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "consentAt" TIMESTAMP(3), ADD COLUMN "consentVersion" TEXT;
