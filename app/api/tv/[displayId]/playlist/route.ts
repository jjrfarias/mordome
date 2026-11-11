import { readTvPlaylist, requireTvDisplay, tvFailure, tvJson } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ displayId: string }> }) {
  try {
    const { displayId } = await context.params;
    const scope = await requireTvDisplay(request, displayId);
    return tvJson(await readTvPlaylist(scope.establishmentId, { displayId }));
  } catch (error) { return tvFailure(error); }
}
