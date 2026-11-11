import { db } from "@/lib/db";
import { exchangeInstagramCode, instagramOAuthConfig, logInstagramGrantDiagnostics } from "@/lib/tv-instagram-oauth";
import { discoverTvInstagramAccounts } from "@/lib/tv-instagram";
import { instagramSessionHash } from "@/lib/tv-instagram-authorization";
import { encryptTvToken, requireTvAdmin, tvDisplayTokenHash } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  let destination = "/configuracoes/instagram?result=failed";
  let attemptId: string | undefined;
  let stateHash: string | undefined;
  let stage = "validate_state";
  try {
    const config = instagramOAuthConfig();
    const query = new URL(request.url).searchParams;
    const state = query.get("state") ?? "";
    if (!/^[\w-]{43}$/.test(state)) throw new Error("INVALID_STATE");
    stateHash = tvDisplayTokenHash(state);
    const pending = await db.tvInstagramAuthorization.findFirst({ where: { stateHash, sessionHash: await instagramSessionHash(), expiresAt: { gt: new Date() }, callbackUsed: false, configId: config.configId } });
    if (!pending) throw new Error("INVALID_STATE");
    const scope = await requireTvAdmin(new Request(`${config.origin}/api/admin/tv?establishmentId=${encodeURIComponent(pending.establishmentId)}`));
    if (scope.actorId !== pending.actorId || scope.organizationId !== pending.organizationId) throw new Error("INVALID_SCOPE");
    const consumed = await db.tvInstagramAuthorization.updateMany({ where: { id: pending.id, stateHash, callbackUsed: false, expiresAt: { gt: new Date() } }, data: { callbackUsed: true } });
    if (!consumed.count) throw new Error("REPLAY");
    attemptId = pending.id;
    destination = `/configuracoes/instagram?establishmentId=${encodeURIComponent(scope.establishmentId)}`;
    if (query.has("error")) {
      await db.tvInstagramAuthorization.deleteMany({ where: { id: attemptId, stateHash } });
      destination += "&result=cancelled";
    } else {
      stage = "validate_code";
      const code = query.get("code") ?? "";
      if (!code || code.length > 8192) throw new Error("INVALID_CODE");
      stage = "exchange_code";
      const grant = await exchangeInstagramCode(code);
      stage = "discover_accounts";
      const accounts = await discoverTvInstagramAccounts(grant.token, "unified", grant.clientBusinessId).catch(async (error: unknown) => {
        await logInstagramGrantDiagnostics(grant.token);
        throw error;
      });
      stage = "save_authorization";
      const saved = await db.tvInstagramAuthorization.updateMany({ where: { id: attemptId, stateHash, expiresAt: { gt: new Date() } }, data: { encryptedToken: encryptTvToken(grant.token, scope.establishmentId), tokenExpiresAt: grant.expiresAt, clientBusinessId: grant.clientBusinessId, systemUserId: grant.systemUserId, accounts, expiresAt: new Date(Date.now() + 600_000) } });
      if (!saved.count) throw new Error("SUPERSEDED");
      destination += "&result=choose";
    }
  } catch {
    // Fixed stage names only; OAuth codes, tokens and provider errors stay private.
    console.warn("instagram_oauth_callback_failed", { stage });
    if (attemptId && stateHash) await db.tvInstagramAuthorization.deleteMany({ where: { id: attemptId, stateHash } }).catch(() => undefined);
    destination = destination.split("&result=")[0].replace("?result=failed", "") + (destination.includes("establishmentId=") ? "&result=failed" : "?result=failed");
  }
  // No provider errors, code, state, token or app secret in the result URL/body.
  return new Response(null, { status: 303, headers: { Location: destination, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
