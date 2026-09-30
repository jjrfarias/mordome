ALTER TABLE "Organization"
  ADD COLUMN "brandLogoUrl" TEXT,
  ADD COLUMN "brandPrimary" TEXT NOT NULL DEFAULT '#173f35',
  ADD COLUMN "brandAccent" TEXT NOT NULL DEFAULT '#e97c4b';
