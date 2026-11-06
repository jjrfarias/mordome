ALTER TABLE "BankAccount" ADD COLUMN "balanceAsOf" DATE;
ALTER TABLE "FinancialEntry" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "FinancialEntry_idempotencyKey_key" ON "FinancialEntry"("idempotencyKey");

CREATE FUNCTION protect_financial_category_kind() RETURNS trigger AS $$
BEGIN
  IF NEW."kind" <> OLD."kind" AND EXISTS (SELECT 1 FROM "FinancialEntry" WHERE "categoryId" = OLD."id") THEN
    RAISE EXCEPTION 'A category with financial entries cannot change kind';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "FinancialCategory_protect_kind" BEFORE UPDATE OF "kind" ON "FinancialCategory"
FOR EACH ROW EXECUTE FUNCTION protect_financial_category_kind();
