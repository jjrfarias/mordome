BEGIN;

ALTER TABLE "Tab" ADD COLUMN "isCounter" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Tab" AS tab SET "isCounter" = dining."isCounter"
FROM "DiningTable" AS dining WHERE dining.id = tab."tableId";

-- Derive the discriminator in the database, never trust a client-supplied flag.
CREATE FUNCTION sync_tab_counter_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT "isCounter" INTO NEW."isCounter" FROM "DiningTable"
  WHERE id = NEW."tableId" AND "establishmentId" = NEW."establishmentId" FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAB_TABLE_ESTABLISHMENT_MISMATCH' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tab_counter_kind BEFORE INSERT OR UPDATE OF "tableId", "establishmentId", "isCounter"
ON "Tab" FOR EACH ROW EXECUTE FUNCTION sync_tab_counter_kind();

CREATE FUNCTION sync_dining_table_counter_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."isCounter" IS DISTINCT FROM OLD."isCounter" THEN
    UPDATE "Tab" SET "isCounter" = NEW."isCounter" WHERE "tableId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dining_table_counter_kind AFTER UPDATE OF "isCounter"
ON "DiningTable" FOR EACH ROW EXECUTE FUNCTION sync_dining_table_counter_kind();

-- Keep the original protection for physical tables. Counter tickets remain separate.
CREATE UNIQUE INDEX "Tab_tableId_open_seated_key" ON "Tab"("tableId")
WHERE "status" = 'OPEN' AND "isCounter" = false;
DROP INDEX "Tab_tableId_open_key";

COMMIT;
