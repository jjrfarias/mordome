import { z } from "zod";
import { businessDay, cents, decimal, validDay } from "./finance-ledger.ts";
export const financeDaySchema = z.string().refine(validDay, "Informe uma data válida.");
export const financeMoneySchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try { return decimal(cents(value)); } catch { ctx.addIssue({ code: "custom", message: "Informe um valor com até duas casas decimais." }); return z.NEVER; }
});
const amount = financeMoneySchema.refine(value => cents(value) > 0, "O valor deve ser maior que zero.");
const fields = {
  categoryId: z.string().min(1), bankAccountId: z.string().min(1).nullable().optional(),
  paymentMethodId: z.string().min(1).nullable().optional(), supplierId: z.string().min(1).nullable().optional(),
  description: z.string().trim().min(2).max(200), amount, dueDate: financeDaySchema,
  notes: z.string().trim().max(500).nullable().optional(),
};
export const createFinanceEntrySchema = z.object({ ...fields, idempotencyKey: z.string().uuid().optional() });
export const updateFinanceEntrySchema = z.object(fields).partial().extend({
  entryId: z.string().min(1), status: z.enum(["PENDING", "PAID"]).optional(),
  paidDate: financeDaySchema.refine(value => value <= businessDay(), "A baixa não pode ter data futura.").optional(),
}).refine(value => Object.keys(value).length > 1, "Informe uma alteração.");
