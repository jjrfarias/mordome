-- ADR 0058: dados da vitrine gerenciados pelo estabelecimento. Migração apenas aditiva.

-- Preço "de" por oferta (unidade + canal), só para apresentação.
ALTER TABLE "ProductOffering" ADD COLUMN "compareAtPrice" DECIMAL(12,2);
ALTER TABLE "ProductOffering"
  ADD CONSTRAINT "ProductOffering_compareAtPrice_check"
  CHECK ("compareAtPrice" IS NULL OR "compareAtPrice" > "price");

-- Marcação vegetariana do produto (definição da organização).
ALTER TABLE "Product" ADD COLUMN "vegetarian" BOOLEAN NOT NULL DEFAULT false;
