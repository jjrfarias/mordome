import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { generateLocalPurchaseOrderFromShoppingList } from "@/lib/local-shopping-list";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const schema = z.object({
  supplierId: z.string().min(1).optional(),
  items: z.array(z.object({
    inventoryItemId: z.string().min(1),
    quantity: z.number().finite().positive(),
    shoppingListItemId: z.string().min(1).optional(),
  })).min(1).max(200),
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageStock) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const { supplierId, items } = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
    const result = generateLocalPurchaseOrderFromShoppingList(session.establishment.id, session.user.id, { supplierId, selectedItems: items });
    if (result === "EMPTY") return Response.json({ error: "Selecione ao menos um item para gerar a ordem de compra." }, { status: 400 });
    if (result === "ITEM_NOT_FOUND") return Response.json({ error: "Item da lista de compras não encontrado." }, { status: 404 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request), action: "CREATE", entityType: "PurchaseOrder", entityId: result.order.id, reason: "Ordem de compra gerada a partir da lista de compras", after: { items } });
    return Response.json({ order: result.order, resolvedIds: result.resolvedIds }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });

  try {
    if (supplierId) {
      const supplier = await db.supplier.findFirst({ where: { id: supplierId, organizationId: actor.organization.id } });
      if (!supplier) return Response.json({ error: "Fornecedor inválido." }, { status: 400 });
    }
    const shoppingListItemIds = items.map(entry => entry.shoppingListItemId).filter((id): id is string => Boolean(id));
    if (shoppingListItemIds.length > 0) {
      const found = await db.shoppingListItem.findMany({ where: { id: { in: shoppingListItemIds }, establishmentId: actor.establishment.id } });
      if (found.length !== shoppingListItemIds.length) return Response.json({ error: "Item da lista de compras não encontrado." }, { status: 404 });
    }
    const configuredItems = await db.establishmentInventoryItem.findMany({ where: { id: { in: items.map(entry => entry.inventoryItemId) }, establishmentId: actor.establishment.id, inventoryItem: { organizationId: actor.organization.id } } });
    if (configuredItems.length !== new Set(items.map(entry => entry.inventoryItemId)).size) return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });

    const result = await db.$transaction(async tx => {
      const order = await tx.purchaseOrder.create({ data: { establishmentId: actor.establishment.id, supplierId: supplierId ?? null, notes: "Gerada a partir da lista de compras", createdById: actor.user.id } });
      for (const entry of items) {
        await tx.purchaseOrderItem.create({ data: { orderId: order.id, inventoryItemId: entry.inventoryItemId, quantity: entry.quantity, estimatedUnitCost: 0 } });
      }
      if (shoppingListItemIds.length > 0) {
        await tx.shoppingListItem.updateMany({ where: { id: { in: shoppingListItemIds }, establishmentId: actor.establishment.id }, data: { resolved: true } });
      }
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "PurchaseOrder", entityId: order.id, reason: "Ordem de compra gerada a partir da lista de compras", after: { items }, ...requestAuditMetadata(request) } });
      return order;
    });
    return Response.json({ order: { id: result.id, status: result.status }, resolvedIds: shoppingListItemIds }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return Response.json({ error: "Não foi possível gerar a ordem de compra." }, { status: 400 });
    return Response.json({ error: "Não foi possível gerar a ordem de compra." }, { status: 500 });
  }
}
