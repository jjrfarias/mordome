import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalCatalog } from "@/lib/local-catalog";
import { createLocalStation, getLocalStationAssignments, listLocalStations, setLocalProductStation, updateLocalStation } from "@/lib/local-stations";
import { findDriver, PRINTER_DRIVERS } from "@/lib/integrations/catalog";

const createSchema = z.object({ name: z.string().trim().min(2).max(60) });
const updateSchema = z.object({
  stationId: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  active: z.boolean().optional(),
  printerDriver: z.string().optional(),
  printerConfig: z.record(z.string(), z.string()).optional(),
  productIds: z.array(z.string().min(1)).optional(),
}).refine(value => value.name !== undefined || value.active !== undefined || value.printerDriver !== undefined || value.productIds !== undefined, {
  message: "Informe ao menos um campo para atualizar.",
});

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
    const stations = listLocalStations(session.establishment.id);
    const products = listLocalCatalog(session.establishment.id).map(product => ({ id: product.id, name: product.name, category: product.category }));
    return Response.json({
      products,
      printerDrivers: PRINTER_DRIVERS,
      stations: stations.map(station => ({ id: station.id, name: station.name, active: station.active, printerDriver: station.printerDriver, printerConfig: station.printerConfig, productIds: getLocalStationAssignments(session.establishment.id, station.id) })),
    });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const [stations, products] = await Promise.all([
    db.preparationStation.findMany({ where: { establishmentId: actor.establishment.id }, include: { productLinks: true, integrations: { where: { category: "PRINTER" } } }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { organizationId: actor.organization.id, active: true }, include: { category: true }, orderBy: { name: "asc" } }),
  ]);
  return Response.json({
    products: products.map(product => ({ id: product.id, name: product.name, category: product.category?.name ?? "Sem categoria" })),
    printerDrivers: PRINTER_DRIVERS,
    stations: stations.map(station => ({ id: station.id, name: station.name, active: station.active, printerDriver: station.integrations[0]?.driver ?? "manual", printerConfig: (station.integrations[0]?.config as Record<string, string>) ?? {}, productIds: station.productLinks.map(link => link.productId) })),
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalStation(session.establishment.id, parsed.data.name);
    if (created === "DUPLICATE") return Response.json({ error: "Já existe uma fila com esse nome." }, { status: 409 });
    return Response.json({ station: { id: created.id, name: created.name, active: created.active, printerDriver: created.printerDriver, printerConfig: created.printerConfig, productIds: [] } }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const station = await db.preparationStation.create({ data: { establishmentId: actor.establishment.id, name: parsed.data.name } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "PreparationStation", entityId: station.id, reason: `Fila "${station.name}" criada` } });
    return Response.json({ station: { id: station.id, name: station.name, active: station.active, printerDriver: "manual", printerConfig: {}, productIds: [] } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma fila com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar a fila." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (data.printerDriver) {
    const driver = findDriver("PRINTER", data.printerDriver);
    if (!driver) return Response.json({ error: "Driver de impressão inválido." }, { status: 400 });
    for (const field of driver.configFields) if (field.required && !data.printerConfig?.[field.key]?.trim()) return Response.json({ error: `Informe "${field.label}".` }, { status: 400 });
  }

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = updateLocalStation(session.establishment.id, data.stationId, { name: data.name, active: data.active, printerDriver: data.printerDriver, printerConfig: data.printerConfig });
    if (updated === "NOT_FOUND") return Response.json({ error: "Fila não encontrada." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe uma fila com esse nome." }, { status: 409 });
    if (data.productIds !== undefined) setLocalProductStation(session.establishment.id, data.stationId, data.productIds);
    return Response.json({ station: { id: updated.id, name: updated.name, active: updated.active, printerDriver: updated.printerDriver, printerConfig: updated.printerConfig, productIds: data.productIds ?? getLocalStationAssignments(session.establishment.id, data.stationId) } });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.preparationStation.findFirst({ where: { id: data.stationId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Fila não encontrada." }, { status: 404 });

  if (data.productIds !== undefined) {
    const validProducts = await db.product.count({ where: { id: { in: data.productIds }, organizationId: actor.organization.id, active: true } });
    if (validProducts !== data.productIds.length) return Response.json({ error: "Produto inválido na seleção." }, { status: 400 });
  }

  try {
    const station = await db.$transaction(async tx => {
      const updated = await tx.preparationStation.update({ where: { id: current.id }, data: { name: data.name, active: data.active } });
      if (data.printerDriver) {
        await tx.stationIntegration.upsert({ where: { stationId_category: { stationId: current.id, category: "PRINTER" } }, create: { stationId: current.id, category: "PRINTER", driver: data.printerDriver, config: data.printerConfig ?? {} }, update: { driver: data.printerDriver, config: data.printerConfig ?? {} } });
      }
      if (data.productIds !== undefined) {
        await tx.productStation.deleteMany({ where: { establishmentId: actor.establishment.id, stationId: current.id } });
        await tx.productStation.deleteMany({ where: { establishmentId: actor.establishment.id, productId: { in: data.productIds } } });
        await tx.productStation.createMany({ data: data.productIds.map(productId => ({ establishmentId: actor.establishment.id, productId, stationId: current.id })) });
      }
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "PreparationStation", entityId: current.id, reason: `Fila "${updated.name}" atualizada` } });
      return updated;
    });
    const [integration, links] = await Promise.all([
      db.stationIntegration.findFirst({ where: { stationId: station.id, category: "PRINTER" } }),
      db.productStation.findMany({ where: { stationId: station.id } }),
    ]);
    return Response.json({ station: { id: station.id, name: station.name, active: station.active, printerDriver: integration?.driver ?? "manual", printerConfig: (integration?.config as Record<string, string>) ?? {}, productIds: links.map(link => link.productId) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma fila com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar a fila." }, { status: 500 });
  }
}
