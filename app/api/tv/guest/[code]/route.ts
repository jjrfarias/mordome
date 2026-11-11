import { findTvGuestStore } from "@/lib/tv-guest";
import { receiveTvUpload } from "@/lib/tv-receive-upload";
import { assertTvSameOrigin, tvFailure, TvError } from "@/lib/tv-server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    assertTvSameOrigin(request);
    const { code } = await params;
    const store = await findTvGuestStore(code);
    if (!store.available) throw new TvError("Os envios estão pausados nesta loja.", 410);
    if (request.headers.get("x-tv-consent") !== "tv-guest-v1") throw new TvError("Autorize a exibição do conteúdo antes de enviar.");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`tv-guest:${code}:${ip}`, 10, 600_000).allowed) throw new TvError("Você enviou vários arquivos. Aguarde dez minutos para tentar novamente.", 429);
    return await receiveTvUpload(request, { establishmentId: store.establishment.id, organizationId: store.establishment.organizationId }, code);
  } catch (error) { return tvFailure(error); }
}
