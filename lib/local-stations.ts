import { randomUUID } from "node:crypto";

type LocalStation = { id: string; establishmentId: string; name: string; active: boolean; printerDriver: string; printerConfig: Record<string, string> };

const stores = new Map<string, LocalStation[]>();
const assignments = new Map<string, Map<string, string>>();

function stationsFor(establishmentId: string) {
  if (!stores.has(establishmentId)) stores.set(establishmentId, []);
  return stores.get(establishmentId)!;
}
function assignmentsFor(establishmentId: string) {
  if (!assignments.has(establishmentId)) assignments.set(establishmentId, new Map());
  return assignments.get(establishmentId)!;
}

export function listLocalStations(establishmentId: string) {
  return stationsFor(establishmentId).map(station => ({ ...station }));
}

export function createLocalStation(establishmentId: string, name: string) {
  const stations = stationsFor(establishmentId);
  if (stations.some(station => station.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return "DUPLICATE" as const;
  const station: LocalStation = { id: `local-station-${randomUUID()}`, establishmentId, name, active: true, printerDriver: "manual", printerConfig: {} };
  stations.push(station);
  return { ...station };
}

export function updateLocalStation(establishmentId: string, stationId: string, data: { name?: string; active?: boolean; printerDriver?: string; printerConfig?: Record<string, string> }) {
  const station = stationsFor(establishmentId).find(candidate => candidate.id === stationId);
  if (!station) return "NOT_FOUND" as const;
  if (data.name && stationsFor(establishmentId).some(candidate => candidate.id !== stationId && candidate.name.toLocaleLowerCase("pt-BR") === data.name!.toLocaleLowerCase("pt-BR"))) return "DUPLICATE" as const;
  const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  Object.assign(station, defined);
  return { ...station };
}

export function getLocalProductStation(establishmentId: string, productId: string) {
  return assignmentsFor(establishmentId).get(productId) ?? null;
}

export function setLocalProductStation(establishmentId: string, stationId: string, productIds: string[]) {
  const map = assignmentsFor(establishmentId);
  for (const [productId, assignedStationId] of [...map]) if (assignedStationId === stationId) map.delete(productId);
  for (const productId of productIds) map.set(productId, stationId);
}

export function getLocalStationAssignments(establishmentId: string, stationId: string) {
  return [...assignmentsFor(establishmentId)].filter(([, assignedStationId]) => assignedStationId === stationId).map(([productId]) => productId);
}
