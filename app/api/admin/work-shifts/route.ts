import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalUsers } from "@/lib/local-access-control";
import {
  assignLocalWorkShiftUser,
  createLocalWorkShift,
  listLocalWorkShifts,
  unassignLocalWorkShiftUser,
  updateLocalWorkShift,
} from "@/lib/local-work-shifts";
import { recordLocalAudit } from "@/lib/local-audit";
import { requestAuditMetadata } from "@/lib/audit";

// Turnos de trabalho da equipe (escala), ver ADR 0030. Reaproveita `establishments.manage`
// (mesma permissão de Motivos de cancelamento, ADR 0029) por ser uma configuração
// administrativa da unidade — não uma ação operacional de rotina.
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:mm.");
const daysOfWeekSchema = z.array(z.number().int().min(0).max(6)).min(1, "Selecione ao menos um dia da semana.").max(7)
  .refine(days => new Set(days).size === days.length, { message: "Dias de semana repetidos." });

const createSchema = z.object({
  action: z.literal("CREATE"),
  name: z.string().trim().min(2).max(60),
  startTime: timeSchema,
  endTime: timeSchema,
  daysOfWeek: daysOfWeekSchema,
});
const assignSchema = z.object({ action: z.literal("ASSIGN_USER"), workShiftId: z.string().min(1), membershipId: z.string().min(1) });
const unassignSchema = z.object({ action: z.literal("UNASSIGN_USER"), workShiftId: z.string().min(1), membershipId: z.string().min(1) });
const actionSchema = z.discriminatedUnion("action", [createSchema, assignSchema, unassignSchema]);

const updateSchema = z.object({
  workShiftId: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  daysOfWeek: daysOfWeekSchema.optional(),
  active: z.boolean().optional(),
}).refine(value => value.name !== undefined || value.startTime !== undefined || value.endTime !== undefined || value.daysOfWeek !== undefined || value.active !== undefined, { message: "Informe ao menos um campo para atualizar." });

function toDaysOfWeekString(days: number[]) {
  return [...days].sort((a, b) => a - b).join(",");
}
function toDaysOfWeekArray(value: string) {
  return value.length ? value.split(",").map(Number) : [];
}
function serializeShift<T extends { daysOfWeek: string }>(shift: T) {
  return { ...shift, daysOfWeek: toDaysOfWeekArray(shift.daysOfWeek) };
}

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageEstablishments) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session?.canManageEstablishments) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({ workShifts: listLocalWorkShifts(session.establishment.id).map(serializeShift) });
  }
  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const shifts = await db.workShift.findMany({ where: { establishmentId: actor.establishment.id }, include: { assignments: true }, orderBy: { name: "asc" } });
  return Response.json({ workShifts: shifts.map(shift => serializeShift({ ...shift, assignedMembershipIds: shift.assignments.map(assignment => assignment.membershipId) })) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session?.canManageEstablishments) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const localBase = { organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request) };

    if (data.action === "CREATE") {
      const created = createLocalWorkShift(session.establishment.id, { name: data.name, startTime: data.startTime, endTime: data.endTime, daysOfWeek: toDaysOfWeekString(data.daysOfWeek) });
      if (created === "DUPLICATE") return Response.json({ error: "Já existe um turno com esse nome nesta unidade." }, { status: 409 });
      recordLocalAudit({ ...localBase, action: "CREATE", entityType: "WorkShift", entityId: created.id, reason: `Turno "${created.name}" criado`, after: created });
      return Response.json({ workShift: serializeShift(created) }, { status: 201 });
    }

    const target = listLocalUsers().find(user => user.membershipId === data.membershipId);
    if (!target || !target.establishmentIds.includes(session.establishment.id)) return Response.json({ error: "Usuário inválido para esta unidade." }, { status: 400 });

    if (data.action === "ASSIGN_USER") {
      const assigned = assignLocalWorkShiftUser(session.establishment.id, data.workShiftId, data.membershipId);
      if (assigned === "NOT_FOUND") return Response.json({ error: "Turno não encontrado." }, { status: 404 });
      recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "WorkShiftAssignment", entityId: assigned.id, reason: `Usuário "${target.name}" atribuído ao turno`, after: { workShiftId: data.workShiftId, membershipId: data.membershipId } });
      return Response.json({ workShift: serializeShift(listLocalWorkShifts(session.establishment.id).find(shift => shift.id === data.workShiftId)!) }, { status: 201 });
    }

    const unassigned = unassignLocalWorkShiftUser(session.establishment.id, data.workShiftId, data.membershipId);
    if (unassigned === "NOT_FOUND") return Response.json({ error: "Atribuição não encontrada." }, { status: 404 });
    recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "WorkShiftAssignment", entityId: `${data.workShiftId}:${data.membershipId}`, reason: `Usuário "${target.name}" removido do turno`, before: { workShiftId: data.workShiftId, membershipId: data.membershipId } });
    return Response.json({ workShift: serializeShift(listLocalWorkShifts(session.establishment.id).find(shift => shift.id === data.workShiftId)!) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  try {
    if (data.action === "CREATE") {
      const shift = await db.workShift.create({ data: { establishmentId: actor.establishment.id, name: data.name, startTime: data.startTime, endTime: data.endTime, daysOfWeek: toDaysOfWeekString(data.daysOfWeek) } });
      await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "WorkShift", entityId: shift.id, reason: `Turno "${shift.name}" criado`, after: { name: shift.name, startTime: shift.startTime, endTime: shift.endTime, daysOfWeek: shift.daysOfWeek } } });
      return Response.json({ workShift: serializeShift({ ...shift, assignedMembershipIds: [] as string[] }) }, { status: 201 });
    }

    const shift = await db.workShift.findFirst({ where: { id: data.workShiftId, establishmentId: actor.establishment.id } });
    if (!shift) return Response.json({ error: "Turno não encontrado." }, { status: 404 });
    const membership = await db.organizationMembership.findFirst({ where: { id: data.membershipId, organizationId: actor.organization.id, accesses: { some: { establishmentId: actor.establishment.id } } }, include: { user: true } });
    if (!membership) return Response.json({ error: "Usuário inválido para esta unidade." }, { status: 400 });

    if (data.action === "ASSIGN_USER") {
      await db.workShiftAssignment.upsert({ where: { workShiftId_membershipId: { workShiftId: shift.id, membershipId: membership.id } }, create: { workShiftId: shift.id, membershipId: membership.id }, update: {} });
      await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "WorkShiftAssignment", entityId: `${shift.id}:${membership.id}`, reason: `Usuário "${membership.user.name}" atribuído ao turno "${shift.name}"`, after: { workShiftId: shift.id, membershipId: membership.id } } });
    } else {
      await db.workShiftAssignment.deleteMany({ where: { workShiftId: shift.id, membershipId: membership.id } });
      await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "WorkShiftAssignment", entityId: `${shift.id}:${membership.id}`, reason: `Usuário "${membership.user.name}" removido do turno "${shift.name}"`, before: { workShiftId: shift.id, membershipId: membership.id } } });
    }
    const assignments = await db.workShiftAssignment.findMany({ where: { workShiftId: shift.id } });
    return Response.json({ workShift: serializeShift({ ...shift, assignedMembershipIds: assignments.map(item => item.membershipId) }) }, { status: data.action === "ASSIGN_USER" ? 201 : 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um turno com esse nome nesta unidade." }, { status: 409 });
    return Response.json({ error: "Não foi possível processar a solicitação." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session?.canManageEstablishments) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = updateLocalWorkShift(session.establishment.id, data.workShiftId, { name: data.name, startTime: data.startTime, endTime: data.endTime, daysOfWeek: data.daysOfWeek ? toDaysOfWeekString(data.daysOfWeek) : undefined, active: data.active });
    if (updated === "NOT_FOUND") return Response.json({ error: "Turno não encontrado." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe um turno com esse nome nesta unidade." }, { status: 409 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "UPDATE", entityType: "WorkShift", entityId: updated.id, reason: `Turno "${updated.name}" atualizado`, after: updated, ...requestAuditMetadata(request) });
    return Response.json({ workShift: serializeShift(listLocalWorkShifts(session.establishment.id).find(shift => shift.id === updated.id)!) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.workShift.findFirst({ where: { id: data.workShiftId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Turno não encontrado." }, { status: 404 });

  try {
    const shift = await db.workShift.update({ where: { id: current.id }, data: { name: data.name, startTime: data.startTime, endTime: data.endTime, daysOfWeek: data.daysOfWeek ? toDaysOfWeekString(data.daysOfWeek) : undefined, active: data.active } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "WorkShift", entityId: shift.id, reason: `Turno "${shift.name}" atualizado` } });
    const assignments = await db.workShiftAssignment.findMany({ where: { workShiftId: shift.id } });
    return Response.json({ workShift: serializeShift({ ...shift, assignedMembershipIds: assignments.map(item => item.membershipId) }) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um turno com esse nome nesta unidade." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar o turno." }, { status: 500 });
  }
}
