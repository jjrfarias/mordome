import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { requestAuditMetadata } from "@/lib/audit";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalAudit, recordLocalAudit } from "@/lib/local-audit";

const schema = z.object({ entityType: z.enum(["Sale", "Order"]), entityId: z.string().min(1), reason: z.string().trim().min(3).max(200).default("Reimpressão solicitada pelo operador") });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Dados de reimpressão inválidos." }, { status: 400 }); const data = parsed.data;
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 }); if (!session.canReprint) return Response.json({ error: "Você não tem permissão para reimprimir." }, { status: 403 });
    const action = data.entityType === "Sale" ? "SALE_COMPLETE" : "ORDER_SENT"; const exists = listLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, action, limit: 1000 }).some(event => event.entityId === data.entityId); if (!exists) return Response.json({ error: "Registro não encontrado nesta unidade." }, { status: 404 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "PRINT_REPRINT", entityType: data.entityType, entityId: data.entityId, reason: data.reason, after: { requestedAt: new Date().toISOString() }, ...requestAuditMetadata(request) });
    return Response.json({ registered: true }, { status: 201 });
  }
  const session = await getCurrentSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 }); if (!session.canReprint) return Response.json({ error: "Você não tem permissão para reimprimir." }, { status: 403 });
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } }); if (!membership) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const exists = data.entityType === "Sale" ? await db.sale.findFirst({ where: { id: data.entityId, organizationId: session.organization.id, establishmentId: session.establishment.id }, select: { id: true } }) : await db.order.findFirst({ where: { id: data.entityId, tab: { establishmentId: session.establishment.id } }, select: { id: true } }); if (!exists) return Response.json({ error: "Registro não encontrado nesta unidade." }, { status: 404 });
  await db.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "PRINT_REPRINT", entityType: data.entityType, entityId: data.entityId, reason: data.reason, after: { requestedAt: new Date().toISOString() }, ...requestAuditMetadata(request) } });
  return Response.json({ registered: true }, { status: 201 });
}
