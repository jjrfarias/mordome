import { requireTvDisplay, tvFailure } from "@/lib/tv-server";
import { tvMediaResponse } from "@/lib/tv-media-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ displayId: string; id: string }> }) {
  try {
    const { displayId, id } = await context.params;
    const scope = await requireTvDisplay(request, displayId);
    return await tvMediaResponse(request, scope.establishmentId, id, true);
  } catch (error) { return tvFailure(error); }
}

export const HEAD = GET;
