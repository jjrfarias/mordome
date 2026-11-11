import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { assertTvSameOrigin, authenticateTvDisplayToken, readTvJson, tvDisplaySessionCookie, tvFailure, tvJson, TvError } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sessionSchema = z.object({ token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/) }).strict();

// No administrative login is required here: the unguessable, revocable display capability
// authorizes only this unit's playlist/media, then moves into a scoped HttpOnly cookie.
export async function POST(request: Request, context: { params: Promise<{ displayId: string }> }) {
  try {
    assertTvSameOrigin(request);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 100) || "unknown";
    if (!rateLimit(`tv:pair:${ip}`, 20, 60_000).allowed) throw new TvError("Muitas tentativas de acesso. Aguarde um minuto.", 429);
    const { displayId } = await context.params;
    const parsed = sessionSchema.safeParse(await readTvJson(request));
    if (!parsed.success) throw new TvError("Acesso de TV inválido. Gere um novo link no Mordomê.", 401);
    await authenticateTvDisplayToken(displayId, parsed.data.token);
    const response = tvJson({ ok: true });
    response.headers.set("Set-Cookie", tvDisplaySessionCookie(displayId, parsed.data.token));
    return response;
  } catch (error) { return tvFailure(error); }
}
