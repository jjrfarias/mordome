-- Foto de produto (ver ADR 0032): guarda a imagem como data URL base64 diretamente no produto.
-- Decisão deliberada desta fatia: sem storage de objeto configurado no projeto, ver ADR para limites e plano de revisão.
ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT;
