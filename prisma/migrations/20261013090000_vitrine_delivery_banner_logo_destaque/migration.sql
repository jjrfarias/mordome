-- AlterTable
ALTER TABLE "Establishment"
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "bannerUrl" TEXT,
  ADD COLUMN "highlightProductId" TEXT,
  ADD COLUMN "highlightHeadline" TEXT;

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_highlightProductId_fkey" FOREIGN KEY ("highlightProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
