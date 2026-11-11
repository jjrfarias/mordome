export const MAX_TV_UPLOAD_BYTES = 30 * 1024 * 1024;
export const MAX_TV_FILES = 100;
export const MAX_TV_TOTAL_BYTES = 1024 * 1024 * 1024;
export const TV_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"] as const;

export function matchesTvFileSignature(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 12) return false;
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (mime === "image/webp") return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
  if (mime === "video/mp4") return text(4, 8) === "ftyp";
  if (mime === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

export function parseTvByteRange(value: string | null, size: number): { offset: number; length: number } | null | "invalid" {
  if (!value) return null;
  if (!Number.isSafeInteger(size) || size <= 0) return "invalid";
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return "invalid";
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(requestedEnd)) return "invalid";
    end = Math.min(requestedEnd, size - 1);
  }
  if (!Number.isSafeInteger(start) || start >= size || start < 0 || end < start) return "invalid";
  return { offset: start, length: end - start + 1 };
}
