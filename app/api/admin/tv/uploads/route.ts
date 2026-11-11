import { requireTvAdmin, tvFailure } from "@/lib/tv-server";
import { receiveTvUpload } from "@/lib/tv-receive-upload";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return await receiveTvUpload(request, await requireTvAdmin(request, true)); }
  catch (error) { return tvFailure(error); }
}
