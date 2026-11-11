import { db } from "@/lib/db";
import { assertTvSameOrigin, readTvJson, requireTvDisplay, tvFailure, tvJson, TvError } from "@/lib/tv-server";
import { playbackReportSchema, readRemoteControl } from "@/lib/tv-remote-model";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The device may report playback, never change the desired remote commands.
export async function POST(request: Request, { params }: { params: Promise<{ displayId: string }> }) {
  try {
    assertTvSameOrigin(request);
    const { displayId } = await params;
    const scope = await requireTvDisplay(request, displayId);
    const parsed = playbackReportSchema.safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Estado de reprodução inválido.");
    const display = await db.tvDisplay.findFirst({ where: { id: displayId, establishmentId: scope.establishmentId, active: true }, select: { remoteControl: true } });
    if (!display) throw new TvError("TV revogada.", 401);
    const control = readRemoteControl(display.remoteControl);
    if (parsed.data.appliedVersion > control.version || parsed.data.navigationVersion > control.navigationVersion) throw new TvError("Atualize a conexão da TV.");
    await db.tvDisplay.updateMany({ where: { id: displayId, active: true }, data: { playbackReport: parsed.data, reportedAt: new Date() } });
    return tvJson({ control });
  } catch (error) { return tvFailure(error); }
}
