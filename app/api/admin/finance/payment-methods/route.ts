import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalPaymentMethod, listLocalPaymentMethods, updateLocalPaymentMethod } from "@/lib/local-finance";

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.string().trim().min(2).max(40),
  feeRate: z.number().min(0).max(100).optional(),
  settlementDays: z.number().int().min(0).max(365).optional(),
});
const updateSchema = z.object({
  methodId: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  kind: z.string().trim().min(2).max(40).optional(),
  feeRate: z.number().min(0).max(100).nullable().optional(),
  settlementDays: z.number().int().min(0).max(365).nullable().optional(),
  active: z.boolean().optional(),
}).refine(value => Object.values(value).some(field => field !== undefined), { message: "Informe ao menos um campo para atualizar." });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageFinance) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({ methods: listLocalPaymentMethods(session.establishment.id) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const methods = await db.paymentMethodConfig.findMany({ where: { establishmentId: actor.establishment.id }, orderBy: { name: "asc" } });
  return Response.json({ methods });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const created = createLocalPaymentMethod(session.establishment.id, parsed.data);
    if (created === "DUPLICATE") return Response.json({ error: "Já existe uma forma de pagamento com esse nome." }, { status: 409 });
    return Response.json({ method: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    const method = await db.paymentMethodConfig.create({ data: { establishmentId: actor.establishment.id, name: parsed.data.name, kind: parsed.data.kind, feeRate: parsed.data.feeRate, settlementDays: parsed.data.settlementDays } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "PaymentMethodConfig", entityId: method.id, reason: `Forma de pagamento "${method.name}" criada` } });
    return Response.json({ method }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma forma de pagamento com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar a forma de pagamento." }, { status: 500 });
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
    if (!session.canManageFinance) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const { methodId, ...changes } = data;
    const updated = updateLocalPaymentMethod(session.establishment.id, methodId, changes);
    if (updated === "NOT_FOUND") return Response.json({ error: "Forma de pagamento não encontrada." }, { status: 404 });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe uma forma de pagamento com esse nome." }, { status: 409 });
    return Response.json({ method: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.paymentMethodConfig.findFirst({ where: { id: data.methodId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Forma de pagamento não encontrada." }, { status: 404 });

  try {
    const method = await db.paymentMethodConfig.update({ where: { id: current.id }, data: { name: data.name, kind: data.kind, feeRate: data.feeRate, settlementDays: data.settlementDays, active: data.active } });
    await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "PaymentMethodConfig", entityId: method.id, reason: `Forma de pagamento "${method.name}" atualizada` } });
    return Response.json({ method });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe uma forma de pagamento com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar a forma de pagamento." }, { status: 500 });
  }
}
