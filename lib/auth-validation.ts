import { z } from "zod";

export const usernameSchema = z.string().trim().min(3, "Use pelo menos 3 caracteres.").max(40).regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou sublinhado.");
export const passwordSchema = z.string().min(8, "Use pelo menos 8 caracteres.").max(128).regex(/[A-Za-zÀ-ÿ]/, "Inclua uma letra.").regex(/[0-9]/, "Inclua um número.");

export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) });
export const setupSchema = z.object({
  ownerName: z.string().trim().min(2).max(100),
  organizationName: z.string().trim().min(2).max(100),
  establishmentName: z.string().trim().min(2).max(100),
  username: usernameSchema,
  password: passwordSchema,
});

export function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "mordome";
}
