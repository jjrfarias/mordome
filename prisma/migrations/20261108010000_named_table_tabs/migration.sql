ALTER TABLE "Tab" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
DROP INDEX "Tab_tableId_open_seated_key";
-- Preserve one unnamed legacy tab, allow independent named accounts per table.
CREATE UNIQUE INDEX "Tab_tableId_name_open_key" ON "Tab" ("tableId", lower(btrim("name")))
WHERE "status" = 'OPEN' AND "isCounter" = false;
