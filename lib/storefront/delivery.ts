import { areaNeighborhoods, findDeliveryAreaByNeighborhood } from "../delivery-area-match.ts";
import type { DeliveryAddress, DeliveryAreaInfo } from "./model.ts";

export type DeliveryQuote =
  | { status: "known"; feeCents: number; area: DeliveryAreaInfo }
  | { status: "pending"; reason: "address" | "area" }
  | { status: "uncovered" }
  | { status: "confirm" };

export function usesAutomaticCoverage(areas: DeliveryAreaInfo[]) {
  return areas.some(area => areaNeighborhoods(area.neighborhoods).length > 0);
}

// Mesmo critério do servidor (POST /api/public/orders): com bairros cadastrados, a área é
// identificada pelo bairro; sem bairros, o cliente escolhe a região. Sem nenhuma área cadastrada, a
// taxa é confirmada pela equipe — nunca é tratada como entrega grátis.
export function quoteDelivery(areas: DeliveryAreaInfo[], address: DeliveryAddress | null): DeliveryQuote {
  if (areas.length === 0) return { status: "confirm" };
  if (!address || !address.neighborhood.trim()) return { status: "pending", reason: "address" };
  if (usesAutomaticCoverage(areas)) {
    const area = findDeliveryAreaByNeighborhood(areas.filter(candidate => areaNeighborhoods(candidate.neighborhoods).length > 0), address.neighborhood);
    return area ? { status: "known", feeCents: area.feeCents, area } : { status: "uncovered" };
  }
  const area = areas.find(candidate => candidate.id === address.areaId);
  return area ? { status: "known", feeCents: area.feeCents, area } : { status: "pending", reason: "area" };
}

export function deliveryFeeLabel(quote: DeliveryQuote) {
  switch (quote.status) {
    case "confirm": return "A confirmar";
    case "uncovered": return "Fora da área";
    case "pending": return "A calcular";
    default: return null;
  }
}

export function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function addressIsComplete(address: DeliveryAddress | null) {
  return Boolean(address && address.postalCode.replace(/\D/g, "").length === 8 && address.street.trim() && address.number.trim() && address.neighborhood.trim());
}

export function parseStoredAddress(raw: string | null): DeliveryAddress | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const text = (key: string) => typeof value[key] === "string" ? (value[key] as string).slice(0, 120) : "";
    const coordinate = (key: string) => typeof value[key] === "number" && Number.isFinite(value[key]) ? value[key] as number : null;
    return { postalCode: text("postalCode"), street: text("street"), number: text("number"), complement: text("complement"), neighborhood: text("neighborhood"), city: text("city"), state: text("state"), latitude: value.locationConfirmed === true ? coordinate("latitude") : null, longitude: value.locationConfirmed === true ? coordinate("longitude") : null, locationConfirmed: value.locationConfirmed === true, areaId: typeof value.areaId === "string" ? value.areaId : null };
  } catch {
    return null;
  }
}
