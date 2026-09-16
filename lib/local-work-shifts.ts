import { randomUUID } from "node:crypto";

// Turnos de trabalho da equipe (escala), ver ADR 0030. Escopo por estabelecimento
// (mesmo padrão de DeliveryArea, ADR 0028) — cada unidade define seus próprios turnos.
// NÃO confundir com CashSession (turno de caixa por operador, app/api/operations/cash/route.ts).
// daysOfWeek é persistido como string "0,1,2,...,6" (0 = domingo) para manter o cadastro simples.
// startTime/endTime são strings "HH:mm" — sem lógica de negócio automática associada ainda.
type LocalWorkShift = { id: string; establishmentId: string; name: string; startTime: string; endTime: string; daysOfWeek: string; active: boolean; createdAt: string };
type LocalWorkShiftAssignment = { id: string; workShiftId: string; membershipId: string; createdAt: string };

const shiftsByEstablishment = new Map<string, LocalWorkShift[]>();
const assignments: LocalWorkShiftAssignment[] = [];

function bucket(establishmentId: string) {
  if (!shiftsByEstablishment.has(establishmentId)) shiftsByEstablishment.set(establishmentId, []);
  return shiftsByEstablishment.get(establishmentId)!;
}
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");

export function listLocalWorkShifts(establishmentId: string) {
  return bucket(establishmentId).map(item => ({ ...item, assignedMembershipIds: assignments.filter(assignment => assignment.workShiftId === item.id).map(assignment => assignment.membershipId) }));
}

export function getLocalWorkShift(establishmentId: string, workShiftId: string) {
  const shift = bucket(establishmentId).find(item => item.id === workShiftId);
  return shift ? { ...shift } : null;
}

export function createLocalWorkShift(establishmentId: string, data: { name: string; startTime: string; endTime: string; daysOfWeek: string }) {
  const list = bucket(establishmentId);
  if (list.some(item => sameName(item.name, data.name))) return "DUPLICATE" as const;
  const shift: LocalWorkShift = { id: `local-work-shift-${randomUUID()}`, establishmentId, name: data.name, startTime: data.startTime, endTime: data.endTime, daysOfWeek: data.daysOfWeek, active: true, createdAt: new Date().toISOString() };
  list.push(shift);
  return { ...shift };
}

export function updateLocalWorkShift(establishmentId: string, workShiftId: string, data: { name?: string; startTime?: string; endTime?: string; daysOfWeek?: string; active?: boolean }) {
  const list = bucket(establishmentId);
  const shift = list.find(item => item.id === workShiftId);
  if (!shift) return "NOT_FOUND" as const;
  if (data.name && list.some(item => item.id !== workShiftId && sameName(item.name, data.name!))) return "DUPLICATE" as const;
  if (data.name !== undefined) shift.name = data.name;
  if (data.startTime !== undefined) shift.startTime = data.startTime;
  if (data.endTime !== undefined) shift.endTime = data.endTime;
  if (data.daysOfWeek !== undefined) shift.daysOfWeek = data.daysOfWeek;
  if (data.active !== undefined) shift.active = data.active;
  return { ...shift };
}

// Atribuição é idempotente: atribuir o mesmo usuário duas vezes ao mesmo turno não duplica
// (decidido nesta fatia — ver ADR 0030, mais simples do que rejeitar com erro 409).
export function assignLocalWorkShiftUser(establishmentId: string, workShiftId: string, membershipId: string) {
  const shift = bucket(establishmentId).find(item => item.id === workShiftId);
  if (!shift) return "NOT_FOUND" as const;
  const existing = assignments.find(item => item.workShiftId === workShiftId && item.membershipId === membershipId);
  if (existing) return { ...existing };
  const assignment: LocalWorkShiftAssignment = { id: `local-work-shift-assignment-${randomUUID()}`, workShiftId, membershipId, createdAt: new Date().toISOString() };
  assignments.push(assignment);
  return { ...assignment };
}

export function unassignLocalWorkShiftUser(establishmentId: string, workShiftId: string, membershipId: string) {
  const shift = bucket(establishmentId).find(item => item.id === workShiftId);
  if (!shift) return "NOT_FOUND" as const;
  const index = assignments.findIndex(item => item.workShiftId === workShiftId && item.membershipId === membershipId);
  if (index === -1) return "NOT_FOUND" as const;
  assignments.splice(index, 1);
  return { ok: true } as const;
}
