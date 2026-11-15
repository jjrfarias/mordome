import { AuditAction, MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { redactAuditValue } from "@/lib/audit";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listLocalAudit } from "@/lib/local-audit";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";

const querySchema = z.object({
  establishmentId: z.string().min(1).optional(),
  action: z.enum(AuditAction).optional(),
  query: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(30),
});

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Filtros de histórico inválidos." }, { status: 400 });
  const filters = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canViewAudit) return Response.json({ error: "Acesso negado ao histórico." }, { status: 403 });
    if (filters.establishmentId && !session.establishments.some(item => item.id === filters.establishmentId)) return Response.json({ error: "Unidade não autorizada." }, { status: 403 });
    const events = listLocalAudit({ organizationId: session.organization.id, establishmentId: filters.establishmentId, action: filters.action, query: filters.query, limit: filters.limit });
    return Response.json({ events: events.map(event => ({ ...event, before: redactAuditValue(event.before), after: redactAuditValue(event.after), closedTab: event.action === "TAB_CLOSE" && event.after && typeof event.after === "object" && "closedTab" in event.after ? event.after.closedTab : null })), total: events.length, page: 1, pages: 1, actions: Object.values(AuditAction) });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.canViewAudit) return Response.json({ error: "Acesso negado ao histórico." }, { status: 403 });
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  if (!membership) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const allowedIds = session.establishments.map(item => item.id);
  if (filters.establishmentId && !allowedIds.includes(filters.establishmentId)) return Response.json({ error: "Unidade não autorizada." }, { status: 403 });
  const namedTabs = filters.query ? await db.tab.findMany({ where: { establishmentId: { in: filters.establishmentId ? [filters.establishmentId] : allowedIds }, name: { contains: filters.query, mode: "insensitive" } }, select: { id: true } }) : [];

  const where: Prisma.AuditEventWhereInput = {
    organizationId: session.organization.id,
    action: filters.action,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
    AND: [
      filters.establishmentId ? { establishmentId: filters.establishmentId } : { OR: [{ establishmentId: null }, { establishmentId: { in: allowedIds } }] },
      filters.query ? { OR: [
        { actor: { name: { contains: filters.query, mode: "insensitive" } } },
        { actor: { username: { contains: filters.query, mode: "insensitive" } } },
        { entityType: { contains: filters.query, mode: "insensitive" } },
        { entityId: { contains: filters.query, mode: "insensitive" } },
        { reason: { contains: filters.query, mode: "insensitive" } },
        ...(namedTabs.length ? [{ entityType: "Tab", entityId: { in: namedTabs.map(tab => tab.id) } }] : []),
      ] } : {},
    ],
  };
  const [events, total] = await db.$transaction([
    db.auditEvent.findMany({ where, include: { actor: { select: { id: true, name: true, username: true } }, establishment: { select: { id: true, name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (filters.page - 1) * filters.limit, take: filters.limit }),
    db.auditEvent.count({ where }),
  ]);
  const tabIds = events.filter(event => event.action === "TAB_CLOSE" && event.entityType === "Tab").map(event => event.entityId);
  const tabs = tabIds.length ? await db.tab.findMany({ where: { id: { in: tabIds }, establishmentId: { in: allowedIds } }, select: { id: true, name: true, sale: { select: { subtotal: true, discount: true, serviceAmount: true, total: true, items: { select: { productName: true, quantity: true, unitPrice: true, total: true, selectedOptionsSnapshot: true } } } } } }) : [];
  const tabsById = new Map(tabs.map(tab => [tab.id, tab]));
  return Response.json({
    events: events.map(event => { const tab = event.action === "TAB_CLOSE" ? tabsById.get(event.entityId) : null; return { ...event, before: redactAuditValue(event.before), after: redactAuditValue(event.after), tabName: tab?.name || null, closedTab: tab?.sale ? { items: tab.sale.items.map(item => ({ productName: item.productName, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), total: Number(item.total), selectedOptionsSnapshot: item.selectedOptionsSnapshot })), subtotal: Number(tab.sale.subtotal), discount: Number(tab.sale.discount), serviceAmount: Number(tab.sale.serviceAmount), total: Number(tab.sale.total) } : null, actorName: event.actor.name, actorUsername: event.actor.username, establishmentName: event.establishment?.name ?? null }; }),
    total,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / filters.limit)),
    actions: Object.values(AuditAction),
  });
}
