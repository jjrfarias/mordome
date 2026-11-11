import { castApplicationId } from "@/lib/tv-cast";
import { requireTvAdmin, tvFailure, tvJson } from "@/lib/tv-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireTvAdmin(request);
    return tvJson({ applicationId: castApplicationId(process.env.TV_CAST_APP_ID) });
  } catch (error) { return tvFailure(error); }
}
