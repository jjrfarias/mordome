import { randomUUID } from "node:crypto";

// Áreas de entrega (escopo estabelecimento) — cadastro simples com taxa fixa e bairros
// atendidos em texto livre, sem geolocalização real (ver ADR 0028).
type LocalDeliveryArea = { id: string; establishmentId: string; name: string; deliveryFee: number; neighborhoods: string | null; active: boolean; createdAt: string };

const areasByEstablishment = new Map<string, LocalDeliveryArea[]>();

function bucket(establishmentId: string) {
  if (!areasByEstablishment.has(establishmentId)) areasByEstablishment.set(establishmentId, []);
  return areasByEstablishment.get(establishmentId)!;
}
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");

export function listLocalDeliveryAreas(establishmentId: string) {
  return bucket(establishmentId).map(item => ({ ...item }));
}

export function getLocalDeliveryArea(establishmentId: string, areaId: string) {
  const area = bucket(establishmentId).find(item => item.id === areaId);
  return area ? { ...area } : null;
}

export function createLocalDeliveryArea(establishmentId: string, data: { name: string; deliveryFee: number; neighborhoods?: string | null }) {
  const list = bucket(establishmentId);
  if (list.some(item => sameName(item.name, data.name))) return "DUPLICATE" as const;
  const area: LocalDeliveryArea = { id: `local-delivery-area-${randomUUID()}`, establishmentId, name: data.name, deliveryFee: data.deliveryFee, neighborhoods: data.neighborhoods ?? null, active: true, createdAt: new Date().toISOString() };
  list.push(area);
  return { ...area };
}

export function updateLocalDeliveryArea(establishmentId: string, areaId: string, data: { name?: string; deliveryFee?: number; neighborhoods?: string | null; active?: boolean }) {
  const list = bucket(establishmentId);
  const area = list.find(item => item.id === areaId);
  if (!area) return "NOT_FOUND" as const;
  if (data.name && list.some(item => item.id !== areaId && sameName(item.name, data.name!))) return "DUPLICATE" as const;
  Object.assign(area, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
  return { ...area };
}
