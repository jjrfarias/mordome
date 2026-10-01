export const customerLoginConfigured = () => Boolean(process.env.WHATSAPP_GATEWAY_URL && process.env.WHATSAPP_GATEWAY_TOKEN && (process.env.CUSTOMER_AUTH_SECRET?.length ?? 0) >= 32);

export async function whatsappGateway(unit: string, action: "status" | "connect" | "disconnect" | "send-code", payload: Record<string, string> = {}) {
  if (!customerLoginConfigured()) throw new Error("WHATSAPP_UNAVAILABLE");
  const base = process.env.WHATSAPP_GATEWAY_URL!;
  const response = await fetch(new URL(`/units/${encodeURIComponent(unit)}/${action}`, base), {
    method: action === "status" ? "GET" : "POST",
    headers: { authorization: `Bearer ${process.env.WHATSAPP_GATEWAY_TOKEN}`, "content-type": "application/json" },
    body: action === "status" ? undefined : JSON.stringify(payload),
    cache: "no-store", signal: AbortSignal.timeout(action === "send-code" ? 20000 : 10000),
  });
  if (!response.ok) throw new Error("WHATSAPP_UNAVAILABLE");
  return response.json() as Promise<{ status: "DISCONNECTED" | "CONNECTING" | "QR" | "READY"; qr?: string }>;
}
