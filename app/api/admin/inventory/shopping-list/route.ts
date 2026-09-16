import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { suggestedPurchaseQuantity } from "@/lib/inventory-domain";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalInventory } from "@/lib/local-inventory";
import { createLocalShoppingListItem, listLocalShoppingListItems, updateLocalShoppingListItem } from "@/lib/local-shopping-list";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const addSchema = z.object({
  action: z.literal("ADD_ITEM"),
  inventoryItemId: z.string().min(1),
  desiredQuantity: z.number().finite().positive(),
  notes: z.string().trim().max(300).optional(),
});
const updateSchema = z.object({
  action: z.literal("UPDATE_ITEM"),
  itemId: z.string().min(1),
  desiredQuantity: z.number().finite().positive().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
  resolved: z.boolean().optional(),
});
const actionSchema = z.discriminatedUnion("action", [addSchema, updateSchema]);

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageStock) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
    const inventory = listLocalInventory(session.establishment.id);
    const suggestions = inventory
      .filter(item => item.configured && item.minimumStock > 0 && item.balance < item.minimumStock)
      .map(item => ({ inventoryItemId: item.establishmentItemId as string, name: item.name, baseUnit: item.baseUnit, balance: item.balance, minimumStock: item.minimumStock, suggestedQuantity: suggestedPurchaseQuantity(item.minimumStock, item.balance) }));
    const manualItems = listLocalShoppingListItems(session.establishment.id, { resolved: false }).map(item => {
      const inventoryItem = inventory.find(candidate => candidate.establishmentItemId === item.inventoryItemId);
      return { id: item.id, inventoryItemId: item.inventoryItemId, name: inventoryItem?.name ?? "Item removido", baseUnit: inventoryItem?.baseUnit ?? "UNIT", desiredQuantity: item.desiredQuantity, notes: item.notes, createdAt: item.createdAt };
    });
    return Response.json({ suggestions, manualItems });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });

  const configuredItems = await db.establishmentInventoryItem.findMany({
    where: { establishmentId: actor.establishment.id, active: true, inventoryItem: { organizationId: actor.organization.id } },
    include: { inventoryItem: { select: { name: true, baseUnit: true } }, movements: { select: { quantity: true } } },
  });
  const suggestions = configuredItems
    .map(item => ({ item, balance: item.movements.reduce((sum, movement) => sum + Number(movement.quantity), 0), minimumStock: Number(item.minimumStock) }))
    .filter(({ balance, minimumStock }) => minimumStock > 0 && balance < minimumStock)
    .map(({ item, balance, minimumStock }) => ({ inventoryItemId: item.id, name: item.inventoryItem.name, baseUnit: item.inventoryItem.baseUnit, balance, minimumStock, suggestedQuantity: suggestedPurchaseQuantity(minimumStock, balance) }));

  const manualRecords = await db.shoppingListItem.findMany({
    where: { establishmentId: actor.establishment.id, resolved: false },
    include: { inventoryItem: { include: { inventoryItem: { select: { name: true, baseUnit: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const manualItems = manualRecords.map(item => ({ id: item.id, inventoryItemId: item.inventoryItemId, name: item.inventoryItem.inventoryItem.name, baseUnit: item.inventoryItem.inventoryItem.baseUnit, desiredQuantity: Number(item.desiredQuantity), notes: item.notes, createdAt: item.createdAt.toISOString() }));

  return Response.json({ suggestions, manualItems });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
    const localBase = { organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request) };

    if (data.action === "ADD_ITEM") {
      const item = createLocalShoppingListItem(session.establishment.id, session.user.id, { inventoryItemId: data.inventoryItemId, desiredQuantity: data.desiredQuantity, notes: data.notes });
      recordLocalAudit({ ...localBase, action: "CREATE", entityType: "ShoppingListItem", entityId: item.id, reason: "Item adicionado à lista de compras", after: data });
      return Response.json({ item }, { status: 201 });
    }
    const { itemId, desiredQuantity, notes, resolved } = data;
    const result = updateLocalShoppingListItem(session.establishment.id, itemId, { desiredQuantity, notes, resolved });
    if (result === "NOT_FOUND") return Response.json({ error: "Item da lista de compras não encontrado." }, { status: 404 });
    recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "ShoppingListItem", entityId: itemId, reason: resolved ? "Item marcado como providenciado" : "Item da lista de compras atualizado", after: { desiredQuantity, notes, resolved } });
    return Response.json({ item: result });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });

  try {
    if (data.action === "ADD_ITEM") {
      const item = await db.establishmentInventoryItem.findFirst({ where: { id: data.inventoryItemId, establishmentId: actor.establishment.id, inventoryItem: { organizationId: actor.organization.id } } });
      if (!item) return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
      const created = await db.$transaction(async tx => {
        const record = await tx.shoppingListItem.create({ data: { establishmentId: actor.establishment.id, inventoryItemId: item.id, desiredQuantity: data.desiredQuantity, notes: data.notes ?? null, createdById: actor.user.id } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "ShoppingListItem", entityId: record.id, reason: "Item adicionado à lista de compras", ...requestAuditMetadata(request) } });
        return record;
      });
      return Response.json({ item: { id: created.id } }, { status: 201 });
    }

    const { itemId, desiredQuantity, notes, resolved } = data;
    const existing = await db.shoppingListItem.findFirst({ where: { id: itemId, establishmentId: actor.establishment.id } });
    if (!existing) return Response.json({ error: "Item da lista de compras não encontrado." }, { status: 404 });
    const updated = await db.$transaction(async tx => {
      const record = await tx.shoppingListItem.update({
        where: { id: itemId },
        data: {
          desiredQuantity: desiredQuantity === undefined ? undefined : desiredQuantity,
          notes: notes === undefined ? undefined : notes,
          resolved: resolved === undefined ? undefined : resolved,
        },
      });
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "ShoppingListItem", entityId: itemId, reason: resolved ? "Item marcado como providenciado" : "Item da lista de compras atualizado", ...requestAuditMetadata(request) } });
      return record;
    });
    return Response.json({ item: { id: updated.id, resolved: updated.resolved } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return Response.json({ error: "Não foi possível salvar a lista de compras." }, { status: 400 });
    return Response.json({ error: "Não foi possível salvar a lista de compras." }, { status: 500 });
  }
}
