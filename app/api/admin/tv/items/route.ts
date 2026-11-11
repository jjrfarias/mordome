import { z } from "zod";
import { db } from "@/lib/db";
import { readCachedTvStories, readTvJson, requireTvAdmin, tvAuditData, tvFailure, tvJson, TvError } from "@/lib/tv-server";
import { deleteTvObject } from "@/lib/tv-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const itemId = z.string().regex(/^(?:ig:\d{5,40}|[a-zA-Z0-9_-]{1,100})$/);
const preferenceSchema = z.object({ id: itemId, enabled: z.boolean() }).strict();
const deleteSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict();

export async function PATCH(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    const parsed = preferenceSchema.safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Conteúdo inválido.");
    const { id, enabled } = parsed.data;
    if (id.startsWith("ig:")) {
      const config = await db.tvConfig.findUnique({ where: { establishmentId: scope.establishmentId } });
      const story = config?.instagramEncryptedToken ? readCachedTvStories(config.instagramStories).find(item => item.id === id) : undefined;
      if (!story?.expiresAt) throw new TvError("Este story já não está disponível. Atualize a lista.", 404);
      const expiresAt = new Date(story.expiresAt);
      await db.$transaction(async tx => {
        await tx.tvStoryPreference.upsert({ where: { establishmentId_mediaId: { establishmentId: scope.establishmentId, mediaId: id } }, create: { establishmentId: scope.establishmentId, mediaId: id, enabled, expiresAt }, update: { enabled, expiresAt } });
        await tx.tvStoryPreference.deleteMany({ where: { establishmentId: scope.establishmentId, expiresAt: { lte: new Date() } } });
        await tx.auditEvent.create({ data: tvAuditData(scope, request, "UPDATE", "TvStoryPreference", id, { enabled }) });
      });
    } else {
      await db.$transaction(async tx => {
        const updated = await tx.tvMedia.updateMany({ where: { id, establishmentId: scope.establishmentId, ready: true, approved: true }, data: { enabled } });
        if (!updated.count) throw new TvError("Arquivo não encontrado.", 404);
        await tx.auditEvent.create({ data: tvAuditData(scope, request, "UPDATE", "TvMedia", id, { enabled }) });
      });
    }
    return tvJson({ ok: true });
  } catch (error) { return tvFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    const parsed = deleteSchema.safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Para ocultar um story do Instagram, desative-o na lista.");
    const item = await db.tvMedia.findFirst({ where: { id: parsed.data.id, establishmentId: scope.establishmentId, ready: true }, select: { id: true, objectKey: true } });
    if (!item) throw new TvError("Arquivo não encontrado.", 404);
    // S3 deletion is idempotent. A failure keeps the row available for an explicit retry.
    await deleteTvObject(item.objectKey);
    await db.$transaction(async tx => {
      const deleted = await tx.tvMedia.deleteMany({ where: { id: item.id, establishmentId: scope.establishmentId } });
      if (deleted.count) await tx.auditEvent.create({ data: tvAuditData(scope, request, "DELETE", "TvMedia", item.id) });
    });
    return tvJson({ ok: true });
  } catch (error) { return tvFailure(error); }
}
