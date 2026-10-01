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

// Preço "de" da vitrine (ADR 0058): opcional e, quando informado, obrigatoriamente maior que o preço
// atual — senão a vitrine anunciaria um desconto que não existe (CDC, publicidade enganosa). O banco
// reforça a mesma regra com CHECK em ProductOffering.
export function compareAtPriceError(price: number, compareAtPrice: number | null | undefined) {
  if (compareAtPrice === null || compareAtPrice === undefined) return null;
  if (!Number.isFinite(compareAtPrice) || compareAtPrice > 999999.99) return "Preço anterior inválido.";
  return Math.round(compareAtPrice * 100) > Math.round(price * 100) ? null : "O preço anterior precisa ser maior que o preço atual.";
}
