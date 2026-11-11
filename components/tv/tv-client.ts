export class TvRequestError extends Error {
  readonly status: number;
  readonly accounts: { id: string; username: string }[];

  constructor(message: string, status: number, accounts: { id: string; username: string }[] = []) {
    super(message);
    this.name = "TvRequestError";
    this.status = status;
    this.accounts = accounts;
  }
}

export async function tvRequest<T>(url: string, options: RequestInit = {}, timeoutMs = 25000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const accounts = Array.isArray(payload?.accounts) ? payload.accounts.filter((item: unknown): item is { id: string; username: string } => Boolean(item && typeof item === "object" && "id" in item && "username" in item && typeof item.id === "string" && typeof item.username === "string")) : [];
      throw new TvRequestError(typeof payload?.error === "string" ? payload.error : "Não foi possível concluir esta ação.", response.status, accounts);
    }
    if (!payload) throw new TvRequestError("O servidor não retornou a programação. Tente novamente.", response.status);
    return payload as T;
  } catch (cause) {
    if (cause instanceof TvRequestError) throw cause;
    throw new TvRequestError("A conexão não respondeu. Confira a internet e tente novamente.", 0);
  } finally {
    clearTimeout(timeout);
  }
}

export const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const tvErrorMessage = (cause: unknown) => cause instanceof Error ? cause.message : "Não foi possível concluir. Tente novamente.";
