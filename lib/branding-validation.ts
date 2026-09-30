import { z } from "zod";
import { PRODUCT_IMAGE_URL_MAX_LENGTH } from "./catalog-validation.ts";

export const brandColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor hexadecimal válida.");
export const tenantBrandingSchema = z.object({
  logoUrl: z.string().max(PRODUCT_IMAGE_URL_MAX_LENGTH).refine(value => value === "" || value.startsWith("data:image/"), "Formato de imagem inválido."),
  primary: brandColorSchema,
  accent: brandColorSchema,
});
