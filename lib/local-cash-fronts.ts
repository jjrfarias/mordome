import { randomUUID } from "node:crypto";

export type LocalCashFront = { id: string; establishmentId: string; name: string; active: boolean; createdAt: string };

const frontsByEstablishment = new Map<string, LocalCashFront[]>();

function bucket(establishmentId: string) {
  if (!frontsByEstablishment.has(establishmentId)) frontsByEstablishment.set(establishmentId, []);
  return frontsByEstablishment.get(establishmentId)!;
}

export function listLocalCashFronts(establishmentId: string) {
  return bucket(establishmentId).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map(front => ({ ...front }));
}

export function findLocalCashFront(establishmentId: string, cashFrontId: string) {
  return bucket(establishmentId).find(front => front.id === cashFrontId) ?? null;
}

export function createLocalCashFront(establishmentId: string, name: string) {
  const list = bucket(establishmentId);
  if (list.some(front => front.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return "DUPLICATE" as const;
  const front: LocalCashFront = { id: `local-cash-front-${randomUUID()}`, establishmentId, name, active: true, createdAt: new Date().toISOString() };
  list.push(front);
  return front;
}

export function updateLocalCashFront(establishmentId: string, cashFrontId: string, data: { name?: string; active?: boolean }) {
  const front = bucket(establishmentId).find(item => item.id === cashFrontId);
  if (!front) return "NOT_FOUND" as const;
  if (data.name && data.name.toLocaleLowerCase("pt-BR") !== front.name.toLocaleLowerCase("pt-BR") && bucket(establishmentId).some(item => item.name.toLocaleLowerCase("pt-BR") === data.name!.toLocaleLowerCase("pt-BR"))) return "DUPLICATE" as const;
  const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  Object.assign(front, defined);
  return { ...front };
}
