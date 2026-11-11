import { db } from "@/lib/db";
import { TvError } from "@/lib/tv-server";
import { getTvObject } from "@/lib/tv-storage";
import { parseTvByteRange } from "@/lib/tv-upload";

export async function tvMediaResponse(request: Request, establishmentId: string, id: string, display = false) {
  const item = await db.tvMedia.findFirst({ where: { id, establishmentId, ready: true, ...(display ? { enabled: true } : {}) } });
  if (!item) throw new TvError("Arquivo não encontrado.", 404);
  const range = parseTvByteRange(request.headers.get("range"), item.size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${item.size}`, "Cache-Control": "no-store" } });
  const headers = new Headers({
    "Content-Type": item.mimeType,
    "Content-Length": String(range ? range.length : item.size),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(item.name).replace(/[!'()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase()),
  });
  if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${item.size}`);
  if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
  const object = await getTvObject(item.objectKey, range ? `bytes=${range.offset}-${range.offset + range.length - 1}` : undefined);
  if (object.contentLength !== (range ? range.length : item.size)) {
    await object.body.cancel();
    throw new TvError("O arquivo está temporariamente indisponível.", 503);
  }
  if (range && object.contentRange !== headers.get("Content-Range")) {
    await object.body.cancel();
    throw new TvError("Não foi possível carregar este trecho do vídeo.", 503);
  }
  if (object.etag) headers.set("ETag", object.etag);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
