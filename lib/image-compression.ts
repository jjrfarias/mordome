// Foto de produto (ver ADR 0032): compressão client-side para não depender de storage de objeto externo.
// A lógica de dimensão é pura e testável em Node; a manipulação real de canvas exige DOM e roda só no navegador.

export const MAX_PRODUCT_IMAGE_DIMENSION = 800;
export const PRODUCT_IMAGE_JPEG_QUALITY = 0.7;

export type ImageDimensions = { width: number; height: number };

/**
 * Calcula as novas dimensões de uma imagem mantendo a proporção, limitando o maior lado a `maxSize`.
 * Nunca amplia uma imagem menor que o limite.
 */
export function calculateResizedDimensions(
  width: number,
  height: number,
  maxSize: number = MAX_PRODUCT_IMAGE_DIMENSION,
): ImageDimensions {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const largestSide = Math.max(width, height);
  if (largestSide <= maxSize) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSize / largestSide;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Lê um arquivo de imagem escolhido pelo usuário, redimensiona (máx. 800px no maior lado) e
 * comprime como JPEG (qualidade ~0.7) usando um <canvas> do navegador, retornando a data URL base64.
 * Não roda em Node — depende de APIs de DOM (Image, canvas).
 */
export async function compressImageFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo de imagem."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Não foi possível processar a imagem selecionada."));
    element.src = dataUrl;
  });

  const { width, height } = calculateResizedDimensions(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem para envio.");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", PRODUCT_IMAGE_JPEG_QUALITY);
}
