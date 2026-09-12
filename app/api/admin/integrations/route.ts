import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { getLocalIntegrations, setLocalIntegration } from "@/lib/local-integrations";
import { DRIVER_CATALOG, findDriver, getActiveIntegrations } from "@/lib/integrations/catalog";

const updateSchema = z.object({
  category: z.enum(["PRINTER", "PAYMENT", "SCALE"]),
  driver: z.string().min(1),
  config: z.record(z.string(), z.string()).default({}),
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageIntegrations) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const active = getLocalIntegrations(session.establishment.id);
    return Response.json({ catalog: DRIVER_CATALOG, active: { PRINTER: active.PRINTER.driver, PAYMENT: active.PAYMENT.driver, SCALE: active.SCALE.driver }, config: { PRINTER: active.PRINTER.config, PAYMENT: active.PAYMENT.config, SCALE: active.SCALE.config } });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const records = await db.establishmentIntegration.findMany({ where: { establishmentId: actor.establishment.id } });
  const active = await getActiveIntegrations(actor.establishment.id);
  const config = Object.fromEntries(records.map(record => [record.category, (record.config as Record<string, string>) ?? {}]));
  return Response.json({ catalog: DRIVER_CATALOG, active: { PRINTER: active.printer, PAYMENT: active.payment, SCALE: active.scale }, config: { PRINTER: config.PRINTER ?? {}, PAYMENT: config.PAYMENT ?? {}, SCALE: config.SCALE ?? {} } });
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  const driver = findDriver(data.category, data.driver);
  if (!driver) return Response.json({ error: "Driver inválido." }, { status: 400 });
  for (const field of driver.configFields) {
    if (field.required && !data.config[field.key]?.trim()) return Response.json({ error: `Informe "${field.label}".` }, { status: 400 });
  }

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = setLocalIntegration(session.establishment.id, data.category, data.driver, data.config);
    return Response.json({ category: data.category, driver: updated.driver, config: updated.config });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const updated = await db.establishmentIntegration.upsert({
    where: { establishmentId_category: { establishmentId: actor.establishment.id, category: data.category } },
    create: { establishmentId: actor.establishment.id, category: data.category, driver: data.driver, config: data.config, active: true },
    update: { driver: data.driver, config: data.config, active: true },
  });
  await db.auditEvent.create({
    data: {
      organizationId: actor.organization.id,
      establishmentId: actor.establishment.id,
      actorId: actor.user.id,
      action: "UPDATE",
      entityType: "EstablishmentIntegration",
      entityId: updated.id,
      reason: `Integração de ${data.category.toLowerCase()} alterada para "${driver.label}"`,
      after: { category: data.category, driver: data.driver },
    },
  });
  return Response.json({ category: updated.category, driver: updated.driver, config: updated.config });
}
