
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_receipt_amounts" CHECK (
 "sourcePaymentId" IS NULL OR ("grossAmount" IS NOT NULL AND "feeAmount" IS NOT NULL AND "feeAmount" >= 0 AND "grossAmount" >= "feeAmount" AND "amount" = "grossAmount" - "feeAmount")
);
CREATE FUNCTION validate_pos_finance_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Establishment" e JOIN "BankAccount" b ON b."establishmentId" = e.id WHERE e.id = NEW."establishmentId" AND e."organizationId" = NEW."organizationId" AND b.id = NEW."bankAccountId") THEN
  RAISE EXCEPTION 'Invalid POS financial scope';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "PosReceiptRule_scope" BEFORE INSERT OR UPDATE ON "PosReceiptRule" FOR EACH ROW EXECUTE FUNCTION validate_pos_finance_scope();
CREATE FUNCTION validate_financial_origin_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."sourcePaymentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Payment" p JOIN "Sale" s ON s.id = p."saleId" WHERE p.id = NEW."sourcePaymentId" AND s."organizationId" = NEW."organizationId" AND s."establishmentId" = NEW."establishmentId") THEN
  RAISE EXCEPTION 'Invalid payment financial scope';
 END IF;
 IF NEW."sourceRefundPaymentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "RefundPayment" p JOIN "Refund" r ON r.id = p."refundId" JOIN "Sale" s ON s.id = r."saleId" WHERE p.id = NEW."sourceRefundPaymentId" AND s."organizationId" = NEW."organizationId" AND s."establishmentId" = NEW."establishmentId") THEN
  RAISE EXCEPTION 'Invalid refund financial scope';
 END IF;
 IF NEW."reversalOfId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FinancialEntry" e WHERE e.id = NEW."reversalOfId" AND e."organizationId" = NEW."organizationId" AND e."establishmentId" = NEW."establishmentId") THEN
  RAISE EXCEPTION 'Invalid reversal financial scope';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "FinancialEntry_origin_scope" BEFORE INSERT OR UPDATE ON "FinancialEntry" FOR EACH ROW EXECUTE FUNCTION validate_financial_origin_scope();
