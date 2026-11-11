import { TV_INSTAGRAM_ENABLED } from "@/lib/tv-features";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { instagramAuthorizationUrl, instagramOAuthConfig } from "@/lib/tv-instagram-oauth";
import { instagramSessionHash } from "@/lib/tv-instagram-authorization";
import { requireTvAdmin, tvDisplayTokenHash, tvFailure, tvJson, TvError } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const scope = await requireTvAdmin(request, true);
    if (!TV_INSTAGRAM_ENABLED) throw new TvError("A integração com o Instagram está pausada. Envie fotos e vídeos para a TV.", 503);
    const config = instagramOAuthConfig();
    if (request.headers.get("origin") !== config.origin) throw new TvError("Abra o endereço principal do Mordomê para conectar o Instagram.", 409, { canonicalUrl: `${config.origin}/configuracoes/instagram?establishmentId=${encodeURIComponent(scope.establishmentId)}` });
    if (!rateLimit(`tv-oauth:${scope.actorId}`, 10, 600_000).allowed) throw new TvError("Aguarde alguns minutos para tentar novamente.", 429);
    const state = randomBytes(32).toString("base64url");
    const sessionHash = await instagramSessionHash();
    const data = { stateHash: tvDisplayTokenHash(state), sessionHash, actorId: scope.actorId, organizationId: scope.organizationId, establishmentId: scope.establishmentId, configId: config.configId, expiresAt: new Date(Date.now() + 600_000), callbackUsed: false, encryptedToken: null, tokenExpiresAt: null, clientBusinessId: null, systemUserId: null, accounts: [] };
    await db.tvInstagramAuthorization.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    // One current attempt per store. Starting again invalidates any earlier authorization.
    await db.tvInstagramAuthorization.upsert({ where: { establishmentId: scope.establishmentId }, create: data, update: data });
    return tvJson({ authorizationUrl: instagramAuthorizationUrl(state) });
  } catch (error) { return tvFailure(error); }
}
