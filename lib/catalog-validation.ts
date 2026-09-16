import { z } from "zod";

// Foto de produto (ver ADR 0032): a compressão client-side visa ~500KB binário; base64 infla ~33%
// (500_000 * 4/3 ≈ 666_667 caracteres) mais o prefixo "data:image/jpeg;base64," (~25 caracteres).
// 700_000 caracteres dá folga confortável sem deixar passar uma imagem gigante que escapou da
// compressão do cliente (ex.: bug no navegador, upload direto sem passar pelo helper de compressão).
export const PRODUCT_IMAGE_URL_MAX_LENGTH = 700000;

export const productImageUrlSchema = z
  .string()
  .trim()
  .max(PRODUCT_IMAGE_URL_MAX_LENGTH)
  .refine(value => value.startsWith("data:image/"), { message: "Formato de imagem inválido." });
