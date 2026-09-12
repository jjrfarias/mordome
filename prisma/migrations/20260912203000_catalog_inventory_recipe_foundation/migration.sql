-- Extend sale origins and create the catalog/stock enums.
ALTER TYPE "SaleChannel" ADD VALUE IF NOT EXISTS 'ONLINE';
ALTER TYPE "SaleChannel" ADD VALUE IF NOT EXISTS 'DELIVERY';

CREATE TYPE "CatalogChannel" AS ENUM ('POS', 'FLOOR', 'ONLINE', 'DELIVERY');
CREATE TYPE "InventoryUnit" AS ENUM ('GRAM', 'MILLILITER', 'UNIT');
CREATE TYPE "InventoryTrackingMode" AS ENUM ('AUTOMATIC', 'MANUAL', 'NONE');
CREATE TYPE "StockMovementType" AS ENUM ('ENTRY', 'CONSUMPTION', 'LOSS', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL', 'PRODUCTION_IN', 'PRODUCTION_OUT');
CREATE TYPE "RecipeKind" AS ENUM ('SALE', 'PREPARATION');
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STOCK_TRANSFER';

-- Promote legacy establishment products to the organization catalog.
ALTER TABLE "Product" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Product" ADD COLUMN "slug" TEXT;
ALTER TABLE "Product" ADD COLUMN "description" TEXT;

UPDATE "Product" product
SET "organizationId" = establishment."organizationId",
    "slug" = product."id"
FROM "Establishment" establishment
WHERE establishment."id" = product."establishmentId";

ALTER TABLE "Product" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "slug" SET NOT NULL;

CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVariant" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductOffering" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "channel" "CatalogChannel" NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductOffering_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "baseUnit" "InventoryUnit" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryConversion" (
  "id" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "factorToBase" DECIMAL(14,4) NOT NULL,
  CONSTRAINT "InventoryConversion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EstablishmentInventoryItem" (
  "id" TEXT NOT NULL,
  "establishmentId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "trackingMode" "InventoryTrackingMode" NOT NULL DEFAULT 'AUTOMATIC',
  "minimumStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "allowNegative" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "EstablishmentInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL,
  "establishmentItemId" TEXT NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unitCost" DECIMAL(12,4),
  "actorId" TEXT NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "reason" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Recipe" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "establishmentId" TEXT,
  "variantId" TEXT,
  "outputInventoryItemId" TEXT,
  "kind" "RecipeKind" NOT NULL,
  "name" TEXT NOT NULL,
  "yieldQuantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeComponent" (
  "id" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "wastePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  CONSTRAINT "RecipeComponent_pkey" PRIMARY KEY ("id")
);

-- Preserve any legacy product as a default variant and zero-price local offering.
INSERT INTO "ProductVariant" ("id", "productId", "name", "isDefault", "active", "createdAt", "updatedAt")
SELECT 'variant-' || product."id", product."id", 'Padrão', true, product."active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" product;

INSERT INTO "ProductOffering" ("id", "establishmentId", "variantId", "channel", "price", "active", "createdAt", "updatedAt")
SELECT 'offering-pos-' || product."id", product."establishmentId", 'variant-' || product."id", 'POS', 0, product."active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" product;

INSERT INTO "ProductOffering" ("id", "establishmentId", "variantId", "channel", "price", "active", "createdAt", "updatedAt")
SELECT 'offering-floor-' || product."id", product."establishmentId", 'variant-' || product."id", 'FLOOR', 0, product."active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" product;

ALTER TABLE "Product" DROP CONSTRAINT "Product_establishmentId_fkey";
DROP INDEX "Product_establishmentId_name_key";
ALTER TABLE "Product" DROP COLUMN "establishmentId";

CREATE UNIQUE INDEX "Product_organizationId_slug_key" ON "Product"("organizationId", "slug");
CREATE INDEX "Product_organizationId_active_idx" ON "Product"("organizationId", "active");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE UNIQUE INDEX "Category_organizationId_slug_key" ON "Category"("organizationId", "slug");
CREATE INDEX "Category_organizationId_active_sortOrder_idx" ON "Category"("organizationId", "active", "sortOrder");
CREATE UNIQUE INDEX "ProductVariant_productId_name_key" ON "ProductVariant"("productId", "name");
CREATE INDEX "ProductVariant_productId_active_idx" ON "ProductVariant"("productId", "active");
CREATE UNIQUE INDEX "ProductOffering_establishmentId_variantId_channel_key" ON "ProductOffering"("establishmentId", "variantId", "channel");
CREATE INDEX "ProductOffering_establishmentId_channel_active_idx" ON "ProductOffering"("establishmentId", "channel", "active");
CREATE UNIQUE INDEX "InventoryItem_organizationId_slug_key" ON "InventoryItem"("organizationId", "slug");
CREATE INDEX "InventoryItem_organizationId_active_idx" ON "InventoryItem"("organizationId", "active");
CREATE UNIQUE INDEX "InventoryConversion_inventoryItemId_name_key" ON "InventoryConversion"("inventoryItemId", "name");
CREATE UNIQUE INDEX "EstablishmentInventoryItem_establishmentId_inventoryItemId_key" ON "EstablishmentInventoryItem"("establishmentId", "inventoryItemId");
CREATE INDEX "EstablishmentInventoryItem_establishmentId_active_idx" ON "EstablishmentInventoryItem"("establishmentId", "active");
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");
CREATE INDEX "StockMovement_establishmentItemId_createdAt_idx" ON "StockMovement"("establishmentItemId", "createdAt");
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");
CREATE INDEX "Recipe_organizationId_kind_active_idx" ON "Recipe"("organizationId", "kind", "active");
CREATE UNIQUE INDEX "Recipe_variantId_establishmentId_kind_key" ON "Recipe"("variantId", "establishmentId", "kind");
CREATE INDEX "Recipe_variantId_establishmentId_idx" ON "Recipe"("variantId", "establishmentId");
CREATE INDEX "Recipe_outputInventoryItemId_idx" ON "Recipe"("outputInventoryItemId");
CREATE UNIQUE INDEX "RecipeComponent_recipeId_inventoryItemId_key" ON "RecipeComponent"("recipeId", "inventoryItemId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOffering" ADD CONSTRAINT "ProductOffering_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOffering" ADD CONSTRAINT "ProductOffering_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryConversion" ADD CONSTRAINT "InventoryConversion_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EstablishmentInventoryItem" ADD CONSTRAINT "EstablishmentInventoryItem_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EstablishmentInventoryItem" ADD CONSTRAINT "EstablishmentInventoryItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_establishmentItemId_fkey" FOREIGN KEY ("establishmentItemId") REFERENCES "EstablishmentInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_outputInventoryItemId_fkey" FOREIGN KEY ("outputInventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Owner capabilities for the new modules.
INSERT INTO "Permission" ("id", "key", "module", "description") VALUES
  ('permission_catalog_manage', 'catalog.manage', 'catalog', 'Gerenciar catálogo da organização'),
  ('permission_recipes_manage', 'recipes.manage', 'recipes', 'Gerenciar fichas técnicas da organização'),
  ('permission_stock_manage', 'stock.manage', 'stock', 'Gerenciar estoque da organização')
ON CONFLICT ("key") DO UPDATE SET "module" = EXCLUDED."module", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "CustomRole" role
CROSS JOIN "Permission" permission
WHERE role."name" = 'Proprietário'
  AND role."systemTemplate" = true
  AND permission."key" IN ('catalog.manage', 'recipes.manage', 'stock.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
