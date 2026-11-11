import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Credentials stay on the server. TV links never grant direct access to the bucket.
function storageConfig() {
  const endpoint = process.env.TV_S3_ENDPOINT;
  const bucket = process.env.TV_S3_BUCKET;
  const accessKeyId = process.env.TV_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.TV_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  try {
    const url = new URL(endpoint);
    const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) return null;
  } catch { return null; }
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: process.env.TV_S3_REGION || "auto" };
}

export function isTvStorageConfigured() { return storageConfig() !== null; }

let cachedClient: S3Client | undefined;
function storage() {
  const config = storageConfig();
  if (!config) throw new Error("TV_STORAGE_NOT_CONFIGURED");
  cachedClient ??= new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: process.env.TV_S3_FORCE_PATH_STYLE === "true",
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: { connectionTimeout: 5_000, socketTimeout: 60_000 },
    maxAttempts: 2,
  });
  return { client: cachedClient, bucket: config.bucket };
}

export async function putTvObject(key: string, body: Uint8Array, mimeType: string) {
  const { client, bucket } = storage();
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: body, ContentType: mimeType, ContentLength: body.byteLength,
    CacheControl: "private, no-store",
  }), { abortSignal: AbortSignal.timeout(90_000) });
}

export async function getTvObject(key: string, range?: string) {
  const { client, bucket } = storage();
  const controller = new AbortController();
  const headerTimeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }), { abortSignal: controller.signal });
    if (!result.Body) throw new Error("TV_MEDIA_UNAVAILABLE");
    return {
      body: result.Body.transformToWebStream(),
      contentLength: result.ContentLength,
      contentRange: result.ContentRange,
      etag: result.ETag,
    };
  } finally {
    // Once headers arrive, only socket inactivity ends a slow, progressing video stream.
    clearTimeout(headerTimeout);
  }
}

export async function deleteTvObject(key: string) {
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(15_000) });
}
