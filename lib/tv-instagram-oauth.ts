import { createHmac } from "node:crypto";
import { securityOrigin } from "@/lib/account-security-policy";
import { TvError } from "@/lib/tv-model";

export const INSTAGRAM_CALLBACK = "/api/integrations/instagram/callback";
export function instagramOAuthConfig() {
  const appId = process.env.META_APP_ID ?? "";
  const appSecret = process.env.META_APP_SECRET ?? "";
  const configId = process.env.META_INSTAGRAM_CONFIG_ID ?? "";
  if (!/^\d{5,30}$/.test(appId) || !/^\d{5,30}$/.test(configId) || appSecret.length < 16 || (process.env.CUSTOMER_AUTH_SECRET?.length ?? 0) < 32) throw new TvError("A conexão com o Instagram está sendo preparada pelo Mordomê. Você já pode usar fotos e vídeos enviados.", 503);
  let origin: string;
  try { origin = securityOrigin(process.env.AUTH_PUBLIC_URL); } catch { throw new TvError("A conexão com o Instagram está sendo preparada pelo Mordomê.", 503); }
  return { appId, appSecret, configId, origin, redirectUri: origin + INSTAGRAM_CALLBACK };
}
export function instagramOAuthConfigured() { try { instagramOAuthConfig(); return true; } catch { return false; } }
export function instagramGraphVersion() { return /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION ?? "") ? process.env.META_GRAPH_VERSION! : "v27.0"; }

export function instagramAuthorizationUrl(state: string) {
  const config = instagramOAuthConfig();
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.search = new URLSearchParams({ client_id: config.appId, config_id: config.configId, redirect_uri: config.redirectUri, response_type: "code", prompt: "login", state }).toString();
  return url.toString();
}

async function metaJson(url: URL, init: RequestInit = {}): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok || !data || typeof data !== "object" || Array.isArray(data) || data.error) {
      if (Number(data?.error?.code) === 190) throw new TvError("A autorização do Instagram expirou ou foi revogada. Conecte novamente.", 401);
      throw new TvError("Não foi possível concluir a autorização na Meta. Tente conectar novamente.", 502);
    }
    return data;
  } catch (error) { if (error instanceof TvError) throw error; throw new TvError("A Meta não respondeu. Tente conectar novamente em instantes.", 502); }
}
function tokenResult(data: Record<string, unknown>, requireExpiry = false) {
  if (typeof data.access_token !== "string" || data.access_token.length < 20 || /\s/.test(data.access_token)) throw new TvError("A Meta não retornou uma autorização válida.", 502);
  const seconds = Number(data.expires_in ?? 0);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10 * 365 * 86400 || (requireExpiry && !seconds)) throw new TvError("A Meta não informou a validade da autorização.", 502);
  return { token: data.access_token, expiresAt: seconds ? new Date(Date.now() + seconds * 1000) : null };
}
export async function exchangeInstagramCode(code: string) {
  const config = instagramOAuthConfig();
  // Meta's documented server-to-server code exchange. Never log this URL or its response.
  const url = new URL(`https://graph.facebook.com/${instagramGraphVersion()}/oauth/access_token`);
  url.search = new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, code, redirect_uri: config.redirectUri }).toString();
  const result = tokenResult(await metaJson(url));
  const profile = new URL(`https://graph.facebook.com/${instagramGraphVersion()}/me`);
  profile.searchParams.set("fields", "client_business_id");
  const identity = await metaJson(profile, { headers: { Authorization: `Bearer ${result.token}` } });
  if (typeof identity.client_business_id !== "string" || !/^\d{5,30}$/.test(identity.client_business_id) || typeof identity.id !== "string" || !/^\d{5,30}$/.test(identity.id)) throw new TvError("A autorização não incluiu o portfólio empresarial. Tente conectar novamente.");
  return { ...result, clientBusinessId: identity.client_business_id, systemUserId: identity.id, configId: config.configId };
}
export async function renewInstagramBusinessToken(token: string, businessId: string, systemUserId: string) {
  if (!/^\d{5,30}$/.test(businessId) || !/^\d{5,30}$/.test(systemUserId)) throw new TvError("Conecte o Instagram novamente.", 401);
  const { appSecret } = instagramOAuthConfig();
  const body = new URLSearchParams({ appsecret_proof: createHmac("sha256", appSecret).update(token).digest("hex"), system_user_id: systemUserId, set_token_expires_in_60_days: "true" });
  const result = await metaJson(new URL(`https://graph.facebook.com/${instagramGraphVersion()}/${businessId}/system_user_access_tokens`), { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
  // This API may omit expires_in; the request explicitly creates a 60-day token.
  return tokenResult({ ...result, expires_in: result.expires_in ?? 60 * 86400 }, true);
}
