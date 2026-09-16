import assert from "node:assert/strict";
import test from "node:test";
import {
  assignLocalWorkShiftUser,
  createLocalWorkShift,
  listLocalWorkShifts,
  unassignLocalWorkShiftUser,
  updateLocalWorkShift,
} from "../lib/local-work-shifts.ts";

test("Turnos: criação com nome duplicado é rejeitada", () => {
  const establishmentId = `work-shift-dup-${Date.now()}`;
  const created = createLocalWorkShift(establishmentId, { name: "Manhã", startTime: "08:00", endTime: "14:00", daysOfWeek: "1,2,3,4,5" });
  assert.notEqual(created, "DUPLICATE");
  const duplicate = createLocalWorkShift(establishmentId, { name: "manhã", startTime: "09:00", endTime: "15:00", daysOfWeek: "1,2,3,4,5" });
  assert.equal(duplicate, "DUPLICATE");
});

test("Turnos: inativação não exclui o turno (mesmo padrão dos demais cadastros)", () => {
  const establishmentId = `work-shift-inactivate-${Date.now()}`;
  const shift = createLocalWorkShift(establishmentId, { name: "Tarde", startTime: "14:00", endTime: "20:00", daysOfWeek: "1,2,3,4,5" });
  assert.notEqual(shift, "DUPLICATE"); if (shift === "DUPLICATE") return;
  const updated = updateLocalWorkShift(establishmentId, shift.id, { active: false });
  assert.notEqual(updated, "NOT_FOUND"); assert.notEqual(updated, "DUPLICATE"); if (typeof updated === "string") return;
  assert.equal(updated.active, false);
  const listed = listLocalWorkShifts(establishmentId).find(candidate => candidate.id === shift.id);
  assert.ok(listed);
  assert.equal(listed?.active, false);
});

test("Turnos: atribuir usuário a um turno", () => {
  const establishmentId = `work-shift-assign-${Date.now()}`;
  const shift = createLocalWorkShift(establishmentId, { name: "Noite", startTime: "18:00", endTime: "23:00", daysOfWeek: "5,6" });
  assert.notEqual(shift, "DUPLICATE"); if (shift === "DUPLICATE") return;
  const assignment = assignLocalWorkShiftUser(establishmentId, shift.id, "membership-1");
  assert.notEqual(assignment, "NOT_FOUND");
  const listed = listLocalWorkShifts(establishmentId).find(candidate => candidate.id === shift.id);
  assert.ok(listed?.assignedMembershipIds.includes("membership-1"));
});

test("Turnos: atribuir o mesmo usuário duas vezes ao mesmo turno é idempotente (não duplica)", () => {
  const establishmentId = `work-shift-idempotent-${Date.now()}`;
  const shift = createLocalWorkShift(establishmentId, { name: "Fim de semana", startTime: "10:00", endTime: "16:00", daysOfWeek: "0,6" });
  assert.notEqual(shift, "DUPLICATE"); if (shift === "DUPLICATE") return;
  assignLocalWorkShiftUser(establishmentId, shift.id, "membership-2");
  assignLocalWorkShiftUser(establishmentId, shift.id, "membership-2");
  const listed = listLocalWorkShifts(establishmentId).find(candidate => candidate.id === shift.id);
  const occurrences = listed?.assignedMembershipIds.filter(id => id === "membership-2").length;
  assert.equal(occurrences, 1);
});

test("Turnos: desatribuir usuário remove a atribuição", () => {
  const establishmentId = `work-shift-unassign-${Date.now()}`;
  const shift = createLocalWorkShift(establishmentId, { name: "Manhã 2", startTime: "07:00", endTime: "13:00", daysOfWeek: "1,2,3,4,5" });
  assert.notEqual(shift, "DUPLICATE"); if (shift === "DUPLICATE") return;
  assignLocalWorkShiftUser(establishmentId, shift.id, "membership-3");
  const result = unassignLocalWorkShiftUser(establishmentId, shift.id, "membership-3");
  assert.notEqual(result, "NOT_FOUND");
  const listed = listLocalWorkShifts(establishmentId).find(candidate => candidate.id === shift.id);
  assert.equal(listed?.assignedMembershipIds.includes("membership-3"), false);
});

test("Isolamento: turnos de um estabelecimento não aparecem para outro", () => {
  const establishmentId = `work-shift-iso-a-${Date.now()}`;
  const otherEstablishmentId = `work-shift-iso-b-${Date.now()}`;
  createLocalWorkShift(establishmentId, { name: "Turno único", startTime: "08:00", endTime: "12:00", daysOfWeek: "1,2,3" });
  assert.equal(listLocalWorkShifts(otherEstablishmentId).length, 0);
  assert.equal(listLocalWorkShifts(establishmentId).length, 1);
});
