import { z } from "zod";
import { db } from "@/lib/db";
import { readTvJson, requireTvAdmin, tvAuditData, tvFailure, tvJson, TvError } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    const parsed = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict().safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Envio inválido.");
    await db.$transaction(async tx => {
      const updated = await tx.tvMedia.updateMany({ where: { id: parsed.data.id, establishmentId: scope.establishmentId, guestSubmission: true, approved: false, ready: true }, data: { approved: true, enabled: true } });
      if (!updated.count) throw new TvError("Este envio já foi revisado ou não foi encontrado.", 404);
      await tx.auditEvent.create({ data: tvAuditData(scope, request, "UPDATE", "TvMedia", parsed.data.id, { approved: true, enabled: true }) });
    });
    return tvJson({ ok: true });
  } catch (error) { return tvFailure(error); }
}
