export const TV_CAST_NAMESPACE = "urn:x-cast:com.mordome.tv";
export type TvCastMessage = { type: "PAIR"; requestId: string; displayId: string; token: string };

export function castApplicationId(value: string | undefined): string | null {
  return value && /^[a-f0-9]{8}$/i.test(value) ? value.toUpperCase() : null;
}

export function parseCastMessage(value: unknown): TvCastMessage | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.type !== "PAIR" || typeof input.requestId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId)
    || typeof input.displayId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.displayId)
    || typeof input.token !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(input.token)) return null;
  return { type: "PAIR", requestId: input.requestId, displayId: input.displayId, token: input.token };
}

// Accept only the relative capability URL produced by our displays endpoint.
export function castPairingFromPath(urlPath: string, requestId: string): TvCastMessage {
  const match = /^\/tv\/([a-zA-Z0-9_-]{1,100})#token=([a-zA-Z0-9_-]{43})$/.exec(urlPath);
  const result = match && parseCastMessage({ type: "PAIR", requestId, displayId: match[1], token: match[2] });
  if (!result) throw new Error("O acesso da TV não pôde ser preparado.");
  return result;
}
