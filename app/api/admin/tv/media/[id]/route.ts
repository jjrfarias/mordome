import { requireTvAdmin, tvFailure } from "@/lib/tv-server";
import { tvMediaResponse } from "@/lib/tv-media-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const scope = await requireTvAdmin(request);
    const { id } = await context.params;
    return await tvMediaResponse(request, scope.establishmentId, id);
  } catch (error) { return tvFailure(error); }
}

export const HEAD = GET;
