export type MatchableDeliveryArea = { id: string; neighborhoods: string | null };

export function normalizePlace(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

export function areaNeighborhoods(value: string | null) {
  return (value ?? "").split(/[,;\n]/).map(normalizePlace).filter(Boolean);
}

export function findDeliveryAreaByNeighborhood<T extends MatchableDeliveryArea>(areas: T[], neighborhood: string) {
  const target = normalizePlace(neighborhood);
  if (!target) return null;
  return areas.find(area => areaNeighborhoods(area.neighborhoods).includes(target)) ?? null;
}
