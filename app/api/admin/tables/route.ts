import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalUsers } from "@/lib/local-access-control";
import { createLocalTables, listLocalTables, updateLocalTable } from "@/lib/local-floor";

const createSchema = z.object({ area: z.string().trim().max(60).optional(), seats: z.number().int().min(1).max(40).default(4), quantity: z.number().int().min(1).max(50) });
const updateSchema = z.object({
  tableId: z.string().min(1),
  name: z.string().trim().max(40).nullable().optional(),
  area: z.string().trim().max(60).nullable().optional(),
  seats: z.number().int().min(1).max(40).optional(),
  active: z.boolean().optional(),
  assignedWaiterId: z.string().min(1).nullable().optional(),
}).refine(value => value.name !== undefined || value.area !== undefined || value.seats !== undefined || value.active !== undefined || value.assignedWaiterId !== undefined, {
  message: "Informe ao menos um campo para atualizar.",
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageFloor) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFloor) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const waiters = listLocalUsers().filter(user => user.userActive && user.establishmentIds.includes(session.establishment.id)).map(user => ({ id: user.userId, name: user.name }));
    return Response.json({ tables: listLocalTables(session.establishment.id), waiters });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const [tables, accesses] = await Promise.all([
    db.diningTable.findMany({ where: { establishmentId: actor.establishment.id, isCounter: false }, orderBy: { number: "asc" } }),
    db.establishmentAccess.findMany({ where: { establishmentId: actor.establishment.id, membership: { organizationId: actor.organization.id, status: MembershipStatus.ACTIVE } }, include: { membership: { include: { user: { select: { id: true, name: true, active: true } } } } } }),
  ]);
  const waiters = accesses.map(access => access.membership.user).filter(user => user.active).filter((user, index, list) => list.findIndex(candidate => candidate.id === user.id) === index).map(user => ({ id: user.id, name: user.name }));
  return Response.json({ tables: tables.map(table => ({ id: table.id, number: table.number, seats: table.seats, name: table.name, area: table.area, assignedWaiterId: table.assignedWaiterId, active: table.active })), waiters });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFloor) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalTables(session.establishment.id, { area: data.area?.trim() || null, seats: data.seats, quantity: data.quantity });
    return Response.json({ tables: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const last = await db.diningTable.findFirst({ where: { establishmentId: actor.establishment.id, isCounter: false }, orderBy: { number: "desc" } });
    const nextNumber = (last?.number ?? 0) + 1;
    const tables = await db.$transaction(async tx => {
      const created = [];
      for (let index = 0; index < data.quantity; index += 1) {
        created.push(await tx.diningTable.create({ data: { establishmentId: actor.establishment.id, number: nextNumber + index, seats: data.seats, area: data.area?.trim() || null } }));
      }
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "DiningTable", entityId: created[0].id, reason: `${data.quantity} mesa(s) criada(s)${data.area ? ` — ${data.area}` : ""}` } });
      return created;
    });
    return Response.json({ tables: tables.map(table => ({ id: table.id, number: table.number, seats: table.seats, name: table.name, area: table.area, assignedWaiterId: table.assignedWaiterId, active: table.active })) }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível criar as mesas." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFloor) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = updateLocalTable(session.establishment.id, data.tableId, { name: data.name, area: data.area, seats: data.seats, active: data.active, assignedWaiterId: data.assignedWaiterId });
    if (updated === "NOT_FOUND") return Response.json({ error: "Mesa não encontrada." }, { status: 404 });
    return Response.json({ table: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.diningTable.findFirst({ where: { id: data.tableId, establishmentId: actor.establishment.id, isCounter: false } });
  if (!current) return Response.json({ error: "Mesa não encontrada." }, { status: 404 });
  if (data.assignedWaiterId) {
    const access = await db.establishmentAccess.findFirst({ where: { establishmentId: actor.establishment.id, membership: { userId: data.assignedWaiterId, organizationId: actor.organization.id, status: MembershipStatus.ACTIVE } } });
    if (!access) return Response.json({ error: "Usuário sem acesso a esta unidade." }, { status: 400 });
  }
  try {
    const table = await db.$transaction(async tx => {
      const updated = await tx.diningTable.update({ where: { id: current.id }, data: { name: data.name, area: data.area, seats: data.seats, active: data.active, assignedWaiterId: data.assignedWaiterId } });
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "DiningTable", entityId: current.id, reason: `Mesa ${updated.number} atualizada` } });
      return updated;
    });
    return Response.json({ table: { id: table.id, number: table.number, seats: table.seats, name: table.name, area: table.area, assignedWaiterId: table.assignedWaiterId, active: table.active } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma mesa com esse número." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar a mesa." }, { status: 500 });
  }
}
