import { TV_INSTAGRAM_ENABLED } from "@/lib/tv-features";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Prisma, TvConfig } from "@/generated/prisma/client";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { requestAuditMetadata } from "@/lib/audit";
import { db } from "@/lib/db";
import { fetchTvStories, instagramMediaUrl } from "@/lib/tv-instagram";
import { TvError, TV_DEFAULT_SETTINGS, activeStories, type TvPlaylistItem, type TvState } from "@/lib/tv-model";
import { isTvStorageConfigured } from "@/lib/tv-storage";
import { instagramOAuthConfigured, renewInstagramBusinessToken } from "@/lib/tv-instagram-oauth";

export { TvError } from "@/lib/tv-model";

export type TvScope = { establishmentId: string; organizationId: string; actorId?: string };
export type TvAdminScope = TvScope & { actorId: string };
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
const DISPLAY_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{43}$/;
const SYNC_INTERVAL_MS = 60_000;
const SYNC_LEASE_MS = 180_000;

export function tvJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export function tvFailure(error: unknown): Response {
  if (error instanceof TvError) return tvJson({ error: error.message, ...error.extra }, error.status);
  // Do not expose or log exceptions, request bodies, provider URLs, tokens or ciphertext.
  return tvJson({ error: "Não foi possível concluir agora. Tente novamente em instantes." }, 500);
}

export const tvErrorResponse = tvFailure;

export function assertTvSameOrigin(request: Request) {
  if (!isSameOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") throw new TvError("Origem inválida. Reabra o Mordomê para continuar.", 403);
}

export async function requireTvAdmin(request: Request, write = false): Promise<TvAdminScope> {
  if (write || !["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTvSameOrigin(request);
  const session = await getCurrentSession();
  if (!session) throw new TvError("Entre no Mordomê para gerenciar a TV.", 401);
  if (!session.canManageIntegrations) throw new TvError("Você não tem permissão para gerenciar a TV.", 403);
  const establishmentId = new URL(request.url).searchParams.get("establishmentId") ?? "";
  if (!ID_PATTERN.test(establishmentId)) throw new TvError("Selecione o estabelecimento para gerenciar a TV.");
  // Never silently follow Session.activeEstablishmentId: a TV is bound to one unit.
  if (!session.establishments.some(establishment => establishment.id === establishmentId)) throw new TvError("Estabelecimento não encontrado.", 404);
  const establishment = await db.establishment.findFirst({
    where: { id: establishmentId, organizationId: session.organization.id, active: true, organization: { active: true } },
    select: { id: true, organizationId: true },
  });
  if (!establishment) throw new TvError("Estabelecimento não encontrado.", 404);
  return { establishmentId: establishment.id, organizationId: establishment.organizationId, actorId: session.user.id };
}

export const resolveTvAdmin = requireTvAdmin;

export function tvDisplayTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tvDisplayCookieName(displayId: string): string {
  if (!ID_PATTERN.test(displayId)) throw new TvError("TV não autorizada.", 401);
  return `mordome_tv_${displayId}`;
}

export async function authenticateTvDisplayToken(displayId: string, token: string): Promise<TvScope> {
  if (!ID_PATTERN.test(displayId) || !DISPLAY_TOKEN_PATTERN.test(token)) throw new TvError("TV não autorizada. Gere um novo acesso no Mordomê.", 401);
  const display = await db.tvDisplay.findFirst({
    where: { id: displayId, tokenHash: tvDisplayTokenHash(token), active: true, establishment: { active: true, organization: { active: true } } },
    select: { id: true, establishmentId: true, lastSeenAt: true, establishment: { select: { organizationId: true } } },
  });
  if (!display) throw new TvError("TV não autorizada. Gere um novo acesso no Mordomê.", 401);
  if (!display.lastSeenAt || display.lastSeenAt.getTime() < Date.now() - 60_000) {
    await db.tvDisplay.updateMany({ where: { id: display.id, active: true }, data: { lastSeenAt: new Date() } });
  }
  return { establishmentId: display.establishmentId, organizationId: display.establishment.organizationId };
}

export async function requireTvDisplay(request: Request, displayId: string): Promise<TvScope> {
  const cookieName = tvDisplayCookieName(displayId);
  const token = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? "";
  // Display APIs accept only the scoped HttpOnly cookie, never admin-session or query fallback.
  return authenticateTvDisplayToken(displayId, token);
}

export const resolveTvDisplay = requireTvDisplay;

export function tvDisplaySessionCookie(displayId: string, token: string): string {
  if (!DISPLAY_TOKEN_PATTERN.test(token)) throw new TvError("Acesso de TV inválido.");
  return `${tvDisplayCookieName(displayId)}=${token}; HttpOnly; SameSite=Strict; Path=/api/tv/${displayId}; Max-Age=31536000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export async function readTvJson<T = unknown>(request: Request): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new TvError("Formato de solicitação inválido.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new TvError("Preencha os dados para continuar.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 16_384) { await reader.cancel(); throw new TvError("Solicitação muito grande.", 413); }
    chunks.push(value);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(data)) as T; } catch { throw new TvError("Dados inválidos."); }
}

export function isTvInstagramConfigured(): boolean {
  return instagramOAuthConfigured();
}

function tvEncryptionKey(): Buffer {
  const secret = process.env.CUSTOMER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new TvError("A conexão segura com o Instagram ainda está sendo configurada.", 503);
  return createHash("sha256").update(`mordome:tv:v1:${secret}`).digest();
}

export function encryptTvToken(token: string, establishmentId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tvEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(establishmentId));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptTvToken(value: string, establishmentId: string): string {
  const key = tvEncryptionKey();
  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.length < 29) throw new Error("INVALID_TOKEN");
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(establishmentId));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  } catch { throw new TvError("Reconecte o Instagram para atualizar os stories.", 401); }
}

export function tvStoriesJson(items: TvPlaylistItem[]): Prisma.InputJsonValue {
  return items.map(item => ({ id: item.id, source: item.source, type: item.type, url: item.url, thumbnailUrl: item.thumbnailUrl ?? null, name: item.name, createdAt: item.createdAt, expiresAt: item.expiresAt ?? null, enabled: item.enabled }));
}

export function readCachedTvStories(value: unknown): TvPlaylistItem[] {
  if (!Array.isArray(value)) return [];
  const stories: TvPlaylistItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const url = instagramMediaUrl(item.url);
    if (typeof item.id !== "string" || !/^ig:\d{5,40}$/.test(item.id) || item.source !== "instagram" || (item.type !== "IMAGE" && item.type !== "VIDEO") || !url || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)) || typeof item.expiresAt !== "string" || !Number.isFinite(Date.parse(item.expiresAt))) continue;
    const thumbnailUrl = instagramMediaUrl(item.thumbnailUrl);
    stories.push({ id: item.id, source: "instagram", type: item.type, url, ...(thumbnailUrl ? { thumbnailUrl } : {}), name: "Story do Instagram", createdAt: item.createdAt, expiresAt: item.expiresAt, enabled: true });
  }
  return activeStories(stories);
}

async function refreshTvInstagram(config: TvConfig): Promise<TvConfig> {
  if (!config.instagramEncryptedToken || !config.instagramAccountId || config.instagramReconnectRequired) return config;
  const now = new Date();
  if ((config.instagramLastAttemptAt && config.instagramLastAttemptAt.getTime() > now.getTime() - SYNC_INTERVAL_MS) || (config.instagramRefreshLeaseUntil && config.instagramRefreshLeaseUntil > now)) return config;
  const leaseUntil = new Date(now.getTime() + SYNC_LEASE_MS);
  // Atomic lease across workers/processes. A crash releases it by expiry; failed calls are throttled too.
  const claimed = await db.tvConfig.updateMany({
    where: {
      establishmentId: config.establishmentId,
      instagramEncryptedToken: config.instagramEncryptedToken,
      establishment: { active: true, organization: { active: true } },
      AND: [
        { OR: [{ instagramLastAttemptAt: null }, { instagramLastAttemptAt: { lte: new Date(now.getTime() - SYNC_INTERVAL_MS) } }] },
        { OR: [{ instagramRefreshLeaseUntil: null }, { instagramRefreshLeaseUntil: { lte: now } }] },
      ],
    },
    data: { instagramLastAttemptAt: now, instagramRefreshLeaseUntil: leaseUntil },
  });
  if (!claimed.count) return await db.tvConfig.findUnique({ where: { establishmentId: config.establishmentId } }) ?? config;
  const ownership = { establishmentId: config.establishmentId, instagramEncryptedToken: config.instagramEncryptedToken, instagramLastAttemptAt: now };
  try {
    let token = decryptTvToken(config.instagramEncryptedToken, config.establishmentId);
    if (config.instagramTokenExpiresAt && config.instagramTokenExpiresAt <= now) throw new TvError("A autorização do Instagram expirou. Conecte novamente.", 401);
    const renewDue = config.instagramTokenExpiresAt && config.instagramTokenExpiresAt.getTime() < now.getTime() + 7 * 86400_000 && config.instagramClientBusinessId && config.instagramSystemUserId && (!config.instagramTokenRefreshAttemptAt || config.instagramTokenRefreshAttemptAt.getTime() < now.getTime() - 3600_000);
    if (renewDue) {
      await db.tvConfig.updateMany({ where: ownership, data: { instagramTokenRefreshAttemptAt: now } });
      const renewed = await renewInstagramBusinessToken(token, config.instagramClientBusinessId!, config.instagramSystemUserId!);
      const encryptedToken = encryptTvToken(renewed.token, config.establishmentId);
      const saved = await db.tvConfig.updateMany({ where: ownership, data: { instagramEncryptedToken: encryptedToken, instagramTokenExpiresAt: renewed.expiresAt } });
      if (!saved.count) return await db.tvConfig.findUnique({ where: { establishmentId: config.establishmentId } }) ?? config;
      ownership.instagramEncryptedToken = encryptedToken;
      token = renewed.token;
    }
    const stories = await fetchTvStories(config.instagramAccountId, token);
    await db.tvConfig.updateMany({ where: ownership, data: { instagramSyncedAt: new Date(), instagramLastError: null, instagramStories: tvStoriesJson(stories), instagramRefreshLeaseUntil: null } });
  } catch (error) {
    const message = error instanceof TvError ? error.message : "Não foi possível atualizar os stories agora. A próxima tentativa será automática.";
    // Keep cached, unexpired stories. A concurrent reconnect/disconnect must not be overwritten.
    await db.tvConfig.updateMany({ where: ownership, data: { instagramLastError: message, instagramRefreshLeaseUntil: null, ...(error instanceof TvError && error.status === 401 ? { instagramReconnectRequired: true } : {}) } });
  }
  return await db.tvConfig.findUnique({ where: { establishmentId: config.establishmentId } }) ?? config;
}

export function tvAuditData(scope: TvScope, request: Request, action: "CREATE" | "UPDATE" | "DELETE", entityType: string, entityId: string, after?: Prisma.InputJsonValue): Prisma.AuditEventUncheckedCreateInput {
  if (!scope.actorId) throw new TvError("Acesso administrativo necessário.", 403);
  return { organizationId: scope.organizationId, establishmentId: scope.establishmentId, actorId: scope.actorId, action, entityType, entityId, ...(after !== undefined ? { after } : {}), ...requestAuditMetadata(request) };
}

export async function readTvPlaylist(establishmentId: string, options: { displayId?: string } = {}): Promise<TvState> {
  const [establishment, initialConfig, media, preferences, displays] = await Promise.all([
    db.establishment.findFirst({ where: { id: establishmentId, active: true, organization: { active: true } }, select: { id: true, name: true, logoUrl: true, organization: { select: { brandLogoUrl: true, brandAccent: true } } } }),
    db.tvConfig.findUnique({ where: { establishmentId } }),
    db.tvMedia.findMany({ where: { establishmentId, ready: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, mimeType: true, name: true, enabled: true, createdAt: true } }),
    db.tvStoryPreference.findMany({ where: { establishmentId, expiresAt: { gt: new Date() } }, select: { mediaId: true, enabled: true } }),
    options.displayId ? Promise.resolve([]) : db.tvDisplay.findMany({ where: { establishmentId, active: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, createdAt: true, lastSeenAt: true } }),
  ]);
  if (!establishment) throw new TvError("Estabelecimento não encontrado.", 404);
  const config = initialConfig && TV_INSTAGRAM_ENABLED ? await refreshTvInstagram(initialConfig) : initialConfig;
  const connected = TV_INSTAGRAM_ENABLED && !!(config?.instagramEncryptedToken && config.instagramAccountId);
  const enabledById = new Map(preferences.map(preference => [preference.mediaId, preference.enabled]));
  const stories = connected ? readCachedTvStories(config?.instagramStories).map(item => ({ ...item, enabled: enabledById.get(item.id) ?? true })) : [];
  const uploads: TvPlaylistItem[] = media.map(item => ({
    id: item.id, source: "upload", type: item.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE",
    url: options.displayId ? `/api/tv/${encodeURIComponent(options.displayId)}/media/${encodeURIComponent(item.id)}` : `/api/admin/tv/media/${encodeURIComponent(item.id)}?establishmentId=${encodeURIComponent(establishmentId)}`,
    name: item.name, enabled: item.enabled, createdAt: item.createdAt.toISOString(),
  }));
  const source = !TV_INSTAGRAM_ENABLED ? "upload" : config?.source === "instagram" || config?.source === "upload" ? config.source : "all";
  const items = [...stories, ...uploads];
  return {
    establishment: { id: establishment.id, name: establishment.name },
    branding: { name: config?.brandName || establishment.name, slogan: config?.slogan ?? "", instagramHandle: config?.instagramHandle || (connected ? config?.instagramUsername ?? "" : ""), logoUrl: establishment.logoUrl || establishment.organization.brandLogoUrl, accentColor: config?.accentColor || establishment.organization.brandAccent },
    settings: { imageDuration: config?.imageDuration ?? TV_DEFAULT_SETTINGS.imageDuration, fit: config?.fit === "cover" ? "cover" : "contain", source, muted: config?.muted ?? TV_DEFAULT_SETTINGS.muted },
    instagram: { connected, username: connected ? config?.instagramUsername ?? null : null, error: connected ? config?.instagramLastError ?? null : null, lastSync: connected ? config?.instagramSyncedAt?.toISOString() ?? null : null, configured: TV_INSTAGRAM_ENABLED && isTvInstagramConfigured() },
    storage: { configured: isTvStorageConfigured() },
    items: options.displayId ? items.filter(item => item.enabled && (source === "all" || item.source === source)) : items,
    ...(!options.displayId ? { displays: displays.map(display => ({ id: display.id, name: display.name, createdAt: display.createdAt.toISOString(), lastSeenAt: display.lastSeenAt?.toISOString() ?? null })) } : {}),
  };
}
