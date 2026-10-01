import { z } from "zod";
import { requestAuditMetadata } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { postalCoordinate } from "@/lib/postal-coordinates";

const cepSchema = z.string().regex(/^\d{8}$/);

export async function GET(request: Request, { params }: { params: Promise<{ postalCode: string }> }) {
  const cep = (await params).postalCode.replace(/\D/g, "");
  if (!cepSchema.safeParse(cep).success) return Response.json({ error: "CEP inválido." }, { status: 400 });
  const ip = requestAuditMetadata(request).ipAddress ?? "unknown";
  if (!rateLimit(`postal-code:${ip}`, 30, 10 * 60 * 1000).allowed) return Response.json({ error: "Muitas consultas de CEP. Aguarde alguns minutos." }, { status: 429 });

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } });
    if (response.status === 404) return Response.json({ error: "CEP não encontrado." }, { status: 404 });
    if (!response.ok) throw new Error(`BrasilAPI ${response.status}`);
    const data = await response.json() as { street?: string; neighborhood?: string; city?: string; state?: string; location?: { coordinates?: { latitude?: string; longitude?: string } } };
    const latitude = postalCoordinate(data.location?.coordinates?.latitude, 90);
    const longitude = postalCoordinate(data.location?.coordinates?.longitude, 180);
    return Response.json({ postalCode: cep, street: data.street ?? "", neighborhood: data.neighborhood ?? "", city: data.city ?? "", state: data.state ?? "", latitude: null, longitude: null, mapReference: latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null });
  } catch {
    console.error({ event: "postal_code_lookup_failed" });
    return Response.json({ error: "Não foi possível consultar o CEP agora." }, { status: 502 });
  }
}
