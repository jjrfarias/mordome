import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { type TvScope, tvFailure, tvJson, TvError } from "@/lib/tv-server";
import { deleteTvObject, isTvStorageConfigured, putTvObject } from "@/lib/tv-storage";
import { MAX_TV_FILES, MAX_TV_TOTAL_BYTES, MAX_TV_UPLOAD_BYTES, TV_MIME_TYPES, matchesTvFileSignature } from "@/lib/tv-upload";



const headerSchema = z.object({
  mimeType: z.enum(TV_MIME_TYPES),
  size: z.coerce.number().int().positive().max(MAX_TV_UPLOAD_BYTES),
  name: z.string().min(1).max(360),
});

async function readUpload(request: Request, expectedSize: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new TvError("O arquivo está vazio.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 60_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > expectedSize || size > MAX_TV_UPLOAD_BYTES) {
        await reader.cancel();
        throw new TvError("Cada arquivo pode ter até 30 MB e deve corresponder ao tamanho informado.", 413);
      }
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  if (timedOut) throw new TvError("O envio demorou demais. Tente novamente.", 408);
  if (size !== expectedSize) throw new TvError("O envio foi interrompido. Tente enviar o arquivo novamente.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function cleanInterruptedUploads(establishmentId: string) {
  // A crashed process may leave a reservation after S3 accepted the object.
  // Delete the object first; failed cleanup remains reserved for a later retry.
  const stale = await db.tvMedia.findMany({
    where: { establishmentId, ready: false, createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
    select: { id: true, objectKey: true }, take: 3, orderBy: { createdAt: "asc" },
  });
  for (const item of stale) {
    try {
      await deleteTvObject(item.objectKey);
      await db.tvMedia.deleteMany({ where: { id: item.id, establishmentId, ready: false } });
    } catch { /* Keep the reservation for the next cleanup attempt. */ }
  }
}

export async function receiveTvUpload(request: Request, scope: TvScope, guestCode?: string) {
  try {

    if (!isTvStorageConfigured()) throw new TvError("O armazenamento da TV ainda não foi configurado.", 503);
    let decodedName = "Conteúdo";
    try { decodedName = decodeURIComponent(request.headers.get("x-file-name") || decodedName); } catch { /* Use a safe default. */ }
    const name = Array.from(decodedName).filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).slice(0, 180).join("").trim() || "Conteúdo";
    const parsed = headerSchema.safeParse({
      mimeType: request.headers.get("content-type")?.split(";")[0].toLowerCase(),
      size: request.headers.get("x-file-size"), name,
    });
    if (!parsed.success) {
      if (parsed.error.issues.some(issue => issue.path[0] === "mimeType")) throw new TvError("Envie JPG, PNG, WebP, MP4 ou WebM.", 415);
      throw new TvError("Cada arquivo pode ter até 30 MB.", 413);
    }
    if (Number(request.headers.get("content-length")) > MAX_TV_UPLOAD_BYTES) throw new TvError("Cada arquivo pode ter até 30 MB.", 413);
    const { mimeType, size } = parsed.data;
    await cleanInterruptedUploads(scope.establishmentId);
    const id = randomUUID();
    const objectKey = `tv/${scope.organizationId}/${scope.establishmentId}/${id}`;
    await db.$transaction(async tx => {
      // Lock a stable parent row so simultaneous uploads cannot overrun the quota.
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Establishment" WHERE "id" = ${scope.establishmentId} AND "organizationId" = ${scope.organizationId} AND "active" = true FOR UPDATE`;
      if (!rows.length) throw new TvError("Unidade indisponível.", 403);
      if (guestCode) {
        const config = await tx.tvConfig.findFirst({ where: { establishmentId: scope.establishmentId, guestCode, guestUploadsEnabled: true } });
        if (!config) throw new TvError("Os envios estão pausados nesta loja.", 410);
        const pending = await tx.tvMedia.aggregate({ where: { establishmentId: scope.establishmentId, guestSubmission: true, approved: false }, _count: true, _sum: { size: true } });
        if (pending._count >= 20 || (pending._sum.size || 0) + size > 200 * 1024 * 1024) throw new TvError("A fila está cheia. Aguarde a loja revisar os envios.", 429);
        const recent = await tx.tvMedia.count({ where: { establishmentId: scope.establishmentId, guestSubmission: true, createdAt: { gt: new Date(Date.now() - 3600000) } } });
        if (recent >= 30) throw new TvError("Muitos envios nesta hora. Tente mais tarde.", 429);
      }
      const usage = await tx.tvMedia.aggregate({ where: { establishmentId: scope.establishmentId }, _count: true, _sum: { size: true } });
      if (usage._count >= MAX_TV_FILES || (usage._sum.size || 0) + size > MAX_TV_TOTAL_BYTES) throw new TvError("Limite de 100 arquivos ou 1 GB por loja. Remova alguns conteúdos para continuar.", 413);
      await tx.tvMedia.create({ data: { id, establishmentId: scope.establishmentId, objectKey, name, mimeType, size, ready: false, guestSubmission: !!guestCode, approved: !guestCode, enabled: !guestCode, ...(guestCode ? { consentAt: new Date(), consentVersion: "tv-guest-v1" } : {}) } });
    });
    let uploadStarted = false;
    let finalizationStarted = false;
    let item;
    try {
      const bytes = await readUpload(request, size);
      if (!matchesTvFileSignature(bytes, mimeType)) throw new TvError("O conteúdo não corresponde ao formato informado.", 415);
      uploadStarted = true;
      await putTvObject(objectKey, bytes, mimeType);
      finalizationStarted = true;
      item = await db.$transaction(async tx => {
        const ready = await tx.tvMedia.update({ where: { id }, data: { ready: true } });
        if (scope.actorId) await tx.auditEvent.create({ data: {
          organizationId: scope.organizationId, establishmentId: scope.establishmentId, actorId: scope.actorId,
          action: "CREATE", entityType: "TvMedia", entityId: id, reason: guestCode ? "Envio público aguardando aprovação; consentimento tv-guest-v1" : "Conteúdo adicionado à TV", after: { name, mimeType, size },
        } });
        return ready;
      });
    } catch (error) {
      // A lost COMMIT acknowledgement does not prove a rollback. Preserve the object:
      // it is either published successfully or still reserved for the stale-upload cleanup.
      if (finalizationStarted) throw error;
      try {
        if (uploadStarted) await deleteTvObject(objectKey);
        await db.tvMedia.deleteMany({ where: { id, establishmentId: scope.establishmentId, ready: false } });
      } catch { /* A reservation is retried by cleanInterruptedUploads. */ }
      throw error;
    }
    if (guestCode) return tvJson({ ok: true, message: "Recebido! A loja vai revisar antes de exibir na TV." }, 201);
    return tvJson({ item: {
      id: item.id, source: "upload", type: item.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE",
      url: `/api/admin/tv/media/${encodeURIComponent(item.id)}?establishmentId=${encodeURIComponent(scope.establishmentId)}`,
      name: item.name, createdAt: item.createdAt.toISOString(), enabled: item.enabled, expiresAt: null,
    } }, 201);
  } catch (error) { return tvFailure(error); }
}
