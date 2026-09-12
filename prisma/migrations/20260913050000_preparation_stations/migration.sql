CREATE TABLE "PreparationStation" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreparationStation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PreparationStation_establishmentId_name_key" ON "PreparationStation"("establishmentId", "name");
ALTER TABLE "PreparationStation" ADD CONSTRAINT "PreparationStation_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProductStation" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductStation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductStation_establishmentId_productId_key" ON "ProductStation"("establishmentId", "productId");
ALTER TABLE "ProductStation" ADD CONSTRAINT "ProductStation_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductStation" ADD CONSTRAINT "ProductStation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductStation" ADD CONSTRAINT "ProductStation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "PreparationStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StationIntegration" (
  "id" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "category" "IntegrationCategory" NOT NULL,
  "driver" TEXT NOT NULL,
  "config" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StationIntegration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StationIntegration_stationId_category_key" ON "StationIntegration"("stationId", "category");
ALTER TABLE "StationIntegration" ADD CONSTRAINT "StationIntegration_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "PreparationStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
