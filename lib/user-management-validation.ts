import { z } from "zod";
import { usernameSchema, passwordSchema } from "./auth-validation.ts";
import { emailSchema } from "./account-security-policy.ts";

export const createManagedUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  establishmentIds: z.array(z.string().min(1)).min(1),
  roleIds: z.array(z.string().min(1)).min(1, "Selecione pelo menos um perfil de acesso."),
});
