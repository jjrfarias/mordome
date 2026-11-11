import { TvError, type TvPlaylistItem } from "@/lib/tv-model";

type GraphRecord = Record<string, unknown>;
export type TvInstagramAccessMode = "unified" | "facebook";

function record(value: unknown): GraphRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as GraphRecord : {};
}

export function instagramMediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    const allowed = ["cdninstagram.com", "fbcdn.net", "instagram.com"];
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !allowed.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return undefined;
    return url.href;
  } catch { return undefined; }
}

async function graph(path: string, token: string, parameters: Record<string, string> = {}): Promise<GraphRecord> {
  // Paths are constructed from validated IDs. Never follow paging URLs or redirects with a token.
  if (!/^(?:\d{5,30}(?:\/stories)?|me\/(?:assigned_instagram_accounts|accounts))$/.test(path)) throw new TvError("Conta do Instagram inválida.");
  const configuredVersion = process.env.META_GRAPH_VERSION ?? "";
  const version = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : "v25.0";
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store" });
  } catch { throw new TvError("O Instagram não respondeu. A próxima tentativa será automática.", 502); }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new TvError("O Instagram retornou uma resposta inesperada. Tente novamente.", 502); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TvError("O Instagram retornou uma resposta inesperada. Tente novamente.", 502);
  const data = record(payload);
  if (!response.ok || data.error) {
    const code = Number(record(data.error).code);
    if (code === 190 || response.status === 401) throw new TvError("A autorização do Instagram expirou ou foi revogada. Reconecte a conta.", 401);
    if ([4, 17, 32, 613, 80002].includes(code) || response.status === 429) throw new TvError("A Meta limitou as consultas por alguns instantes. A atualização será retomada automaticamente.", 429);
    if ([10, 100, 200].includes(code)) throw new TvError("A Meta não liberou a leitura dos stories. Confira o ID profissional, o método de login, a conta compartilhada e as permissões do aplicativo.");
    throw new TvError("Não foi possível consultar a conta na Meta. Confira a autorização e tente novamente.", 502);
  }
  return data;
}

export async function fetchTvStories(accountId: string, token: string): Promise<TvPlaylistItem[]> {
  const stories: TvPlaylistItem[] = [];
  let after = "";
  const cursors = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const parameters: Record<string, string> = { fields: "id,media_type,media_url,thumbnail_url,timestamp", limit: "100" };
    if (after) parameters.after = after;
    const result = await graph(`${accountId}/stories`, token, parameters);
    if (!Array.isArray(result.data)) throw new TvError("O Instagram não retornou a lista de stories esperada. Tente novamente.", 502);
    for (const raw of result.data) {
      const item = record(raw);
      const url = instagramMediaUrl(item.media_url);
      const timestamp = typeof item.timestamp === "string" ? Date.parse(item.timestamp) : NaN;
      const expiresAt = timestamp + 24 * 60 * 60 * 1000;
      if (typeof item.id !== "string" || !/^\d{5,40}$/.test(item.id) || !url || !Number.isFinite(timestamp) || expiresAt <= Date.now() || (item.media_type !== "IMAGE" && item.media_type !== "VIDEO")) continue;
      const thumbnailUrl = instagramMediaUrl(item.thumbnail_url);
      stories.push({ id: `ig:${item.id}`, source: "instagram", type: item.media_type, url, ...(thumbnailUrl ? { thumbnailUrl } : {}), name: "Story do Instagram", createdAt: new Date(timestamp).toISOString(), expiresAt: new Date(expiresAt).toISOString(), enabled: true });
    }
    const paging = record(result.paging);
    const cursor = record(paging.cursors).after;
    if (!paging.next || !result.data.length) break;
    if (typeof cursor !== "string" || !cursor || cursor.length > 2048 || cursors.has(cursor) || page === 9) throw new TvError("Não foi possível atualizar todos os stories. A próxima tentativa será automática.", 502);
    cursors.add(cursor);
    after = cursor;
  }
  return Array.from(new Map(stories.map(item => [item.id, item])).values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function connectTvInstagramAccount(input: { accessToken: string; accountId?: string; accessMode: TvInstagramAccessMode }) {
  const token = input.accessToken;
  let accountId = input.accountId || "";
  if (!accountId) {
    const accounts = new Map<string, { id: string; username: string }>();
    const cursors = new Set<string>();
    let after = "";
    for (let page = 0; page < 10; page++) {
      const parameters: Record<string, string> = { fields: input.accessMode === "unified" ? "id,username" : "instagram_business_account{id,username}", limit: "100" };
      if (after) parameters.after = after;
      const result = await graph(input.accessMode === "unified" ? "me/assigned_instagram_accounts" : "me/accounts", token, parameters);
      if (!Array.isArray(result.data)) throw new TvError("A Meta não retornou a lista de contas esperada. Confira o método de conexão.", 502);
      for (const raw of result.data) {
        const item = record(raw);
        const account = input.accessMode === "unified" ? item : record(item.instagram_business_account);
        if (typeof account.id === "string" && /^\d{5,30}$/.test(account.id)) accounts.set(account.id, { id: account.id, username: typeof account.username === "string" ? account.username.slice(0, 100) : account.id });
      }
      const paging = record(result.paging);
      const cursor = record(paging.cursors).after;
      if (!result.data.length || !cursor || (input.accessMode === "facebook" && !paging.next)) break;
      if (typeof cursor !== "string" || cursor.length > 2048 || cursors.has(cursor) || page === 9) throw new TvError("Não foi possível listar todas as contas. Informe o ID profissional do Instagram que deseja exibir.");
      cursors.add(cursor);
      after = cursor;
    }
    const unique = [...accounts.values()];
    if (!unique.length) throw new TvError(input.accessMode === "unified"
      ? "Nenhuma conta do Instagram foi compartilhada com este acesso. Confira o portfólio empresarial, a autorização da conta e a permissão business_management, ou informe o ID autorizado."
      : "Nenhum Instagram profissional vinculado foi encontrado. Confira a Página do Facebook e a permissão pages_show_list, ou informe o ID do Instagram.");
    if (unique.length > 1) throw new TvError("Escolha a conta do Instagram que será exibida na TV.", 409, { accounts: unique });
    accountId = unique[0].id;
  }
  const profile = await graph(accountId, token, { fields: "id,username" });
  if (profile.id !== accountId || typeof profile.username !== "string" || !/^[a-zA-Z0-9._]{1,30}$/.test(profile.username)) throw new TvError("Não foi possível confirmar essa conta profissional do Instagram.");
  // Profile access alone does not prove that this authorization can read Stories.
  const stories = await fetchTvStories(accountId, token);
  return { accountId, username: profile.username, stories };
}
