import { z } from "zod";
import { passwordSchema, usernameSchema } from "./auth-validation.ts";

export const systemLoginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) });

export const createTenantSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  establishmentName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(100),
  ownerUsername: usernameSchema,
  ownerPassword: passwordSchema,
});

export const updateTenantStatusSchema = z.object({
  organizationId: z.string().min(1),
  active: z.boolean(),
  reason: z.string().trim().min(5).max(300),
});
