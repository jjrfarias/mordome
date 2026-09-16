import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalDeliveryArea, listLocalDeliveryAreas, updateLocalDeliveryArea } from "@/lib/local-delivery-areas";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  deliveryFee: z.number().finite().min(0).max(9999),
  neighborhoods: z.string().trim().max(500).optional(),
});
const updateSchema = z.object({
  areaId: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  deliveryFee: z.number().finite().min(0).max(9999).optional(),
  neighborhoods: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
}).refine(value => Object.entries(value).some(([key, field]) => key !== "areaId" && field !== undefined), { message: "Informe ao menos um campo para atualizar." });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageCatalog) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({ areas: listLocalDeliveryAreas(session.establishment.id) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const areas = await db.deliveryArea.findMany({ where: { establishmentId: actor.establishment.id }, orderBy: { name: "asc" } });
  return Response.json({ areas: areas.map(area => ({ ...area, deliveryFee: Number(area.deliveryFee) })) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalDeliveryArea(session.establishment.id, parsed.data);
    if (created === "DUPLICATE") return Response.json({ error: "Já existe uma área de entrega com esse nome." }, { status: 409 });
    return Response.json({ area: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const area = await db.deliveryArea.create({ data: { establishmentId: actor.establishment.id, name: parsed.data.name, deliveryFee: parsed.data.deliveryFee, neighborhoods: parsed.data.neighborhoods } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "DeliveryArea", entityId: area.id, reason: `Área de entrega "${area.name}" criada` } });
    return Response.json({ area: { ...area, deliveryFee: Number(area.deliveryFee) } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma área de entrega com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar a área de entrega." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const { areaId, ...changes } = data;
    const updated = updateLocalDeliveryArea(session.establishment.id, areaId, changes);
    if (updated === "NOT_FOUND") return Response.json({ error: "Área de entrega não encontrada." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe uma área de entrega com esse nome." }, { status: 409 });
    return Response.json({ area: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.deliveryArea.findFirst({ where: { id: data.areaId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Área de entrega não encontrada." }, { status: 404 });

  try {
    const area = await db.deliveryArea.update({ where: { id: current.id }, data: { name: data.name, deliveryFee: data.deliveryFee, neighborhoods: data.neighborhoods, active: data.active } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "DeliveryArea", entityId: area.id, reason: `Área de entrega "${area.name}" atualizada` } });
    return Response.json({ area: { ...area, deliveryFee: Number(area.deliveryFee) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma área de entrega com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar a área de entrega." }, { status: 500 });
  }
}
