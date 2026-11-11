import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { readTvJson, requireTvAdmin, tvAuditData, tvDisplayTokenHash, tvFailure, tvJson, TvError } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const deleteSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict();

export async function POST(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    const parsed = createSchema.safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Dê um nome à TV com até 80 caracteres.");
    const token = randomBytes(32).toString("base64url");
    const display = await db.$transaction(async tx => {
      const created = await tx.tvDisplay.create({ data: { establishmentId: scope.establishmentId, name: parsed.data.name, tokenHash: tvDisplayTokenHash(token) }, select: { id: true, name: true } });
      await tx.auditEvent.create({ data: tvAuditData(scope, request, "CREATE", "TvDisplay", created.id, { name: created.name }) });
      return created;
    });
    // Reveal the capability once, in a URL fragment; it never appears in query strings or stored state.
    return tvJson({ ...display, urlPath: `/tv/${display.id}#token=${token}` }, 201);
  } catch (error) { return tvFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    const parsed = deleteSchema.safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("TV inválida.");
    await db.$transaction(async tx => {
      const updated = await tx.tvDisplay.updateMany({ where: { id: parsed.data.id, establishmentId: scope.establishmentId, active: true }, data: { active: false } });
      if (!updated.count) throw new TvError("TV não encontrada.", 404);
      await tx.auditEvent.create({ data: tvAuditData(scope, request, "DELETE", "TvDisplay", parsed.data.id, { active: false }) });
    });
    return tvJson({ ok: true });
  } catch (error) { return tvFailure(error); }
}
