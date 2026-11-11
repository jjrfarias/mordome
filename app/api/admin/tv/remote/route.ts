import { db } from "@/lib/db";
import { readTvJson, requireTvAdmin, tvAuditData, tvFailure, tvJson, TvError } from "@/lib/tv-server";
import { nextRemoteControl, playbackReportSchema, readRemoteControl, remoteActionSchema } from "@/lib/tv-remote-model";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function target(request: Request, write = false) {
  const scope = await requireTvAdmin(request, write);
  const id = new URL(request.url).searchParams.get("displayId") || "";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new TvError("Selecione uma TV.");
  const display = await db.tvDisplay.findFirst({ where: { id, establishmentId: scope.establishmentId, active: true } });
  if (!display) throw new TvError("TV não encontrada ou revogada.", 404);
  return { scope, display };
}
export async function GET(request: Request) {
  try {
    const { display } = await target(request);
    return tvJson({ control: readRemoteControl(display.remoteControl), report: playbackReportSchema.safeParse(display.playbackReport).data ?? null, reportedAt: display.reportedAt?.toISOString() ?? null });
  } catch (error) { return tvFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { scope, display } = await target(request, true);
    const action = remoteActionSchema.safeParse(await readTvJson(request));
    if (!action.success) throw new TvError("Comando inválido.");
    const control = await db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "TvDisplay" WHERE "id" = ${display.id} AND "active" = true FOR UPDATE`;
      if (!rows.length) throw new TvError("TV revogada.", 404);
      const latest = await tx.tvDisplay.findUniqueOrThrow({ where: { id: display.id } });
      const items = await tx.tvMedia.findMany({ where: { establishmentId: scope.establishmentId, ready: true, enabled: true, approved: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
      if (["next", "previous"].includes(action.data.action) && !items.length) throw new TvError("Adicione conteúdo à programação antes de passar os arquivos.");
      const next = nextRemoteControl(readRemoteControl(latest.remoteControl), action.data, items.map(item => item.id), playbackReportSchema.safeParse(latest.playbackReport).data ?? null);
      await tx.tvDisplay.update({ where: { id: display.id }, data: { remoteControl: next } });
      await tx.auditEvent.create({ data: tvAuditData(scope, request, "UPDATE", "TvDisplayRemote", display.id, { ...action.data, version: next.version }) });
      return next;
    });
    return tvJson({ control });
  } catch (error) { return tvFailure(error); }
}
