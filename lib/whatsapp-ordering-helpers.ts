export function publicOrderUrl(establishmentId: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://web-production-69fa8.up.railway.app").replace(/\/$/, "");
  return `${base}/pedido-online/${establishmentId}`;
}

export function normalizeWhatsAppText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

export function parseNumberChoice(value: string) {
  const match = value.trim().match(/^(?:(\d{1,2})\s*x\s*)?(\d{1,2})$/i);
  if (!match) return null;
  return { quantity: Number(match[1] ?? 1), index: Number(match[2]) };
}
