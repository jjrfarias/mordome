import { MembershipStatus, Prisma, PurchaseOrderStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import {
  addLocalPurchaseOrderItem,
  cancelLocalPurchaseOrder,
  createLocalPurchaseOrder,
  listLocalPurchaseOrders,
  removeLocalPurchaseOrderItem,
  sendLocalPurchaseOrder,
  updateLocalPurchaseOrder,
} from "@/lib/local-purchase-orders";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const createSchema = z.object({
  action: z.literal("CREATE_ORDER"),
  supplierId: z.string().min(1).optional(),
  expectedDate: z.string().min(1).optional(),
  notes: z.string().trim().max(500).optional(),
});
const addItemSchema = z.object({
  action: z.literal("ADD_ITEM"),
  orderId: z.string().min(1),
  establishmentItemId: z.string().min(1),
  quantity: z.number().finite().positive(),
  estimatedUnitCost: z.number().finite().min(0),
});
const removeItemSchema = z.object({ action: z.literal("REMOVE_ITEM"), orderId: z.string().min(1), itemId: z.string().min(1) });
const updateOrderSchema = z.object({
  action: z.literal("UPDATE_ORDER"),
  orderId: z.string().min(1),
  supplierId: z.string().min(1).nullable().optional(),
  expectedDate: z.string().min(1).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
const sendSchema = z.object({ action: z.literal("SEND"), orderId: z.string().min(1) });
const cancelSchema = z.object({ action: z.literal("CANCEL"), orderId: z.string().min(1) });
const actionSchema = z.discriminatedUnion("action", [createSchema, addItemSchema, removeItemSchema, updateOrderSchema, sendSchema, cancelSchema]);

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageStock) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam && (["DRAFT", "SENT", "RECEIVED", "CANCELLED"] as const).includes(statusParam as PurchaseOrderStatus) ? (statusParam as PurchaseOrderStatus) : undefined;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
    return Response.json({ orders: listLocalPurchaseOrders(session.establishment.id, { status }) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
  const orders = await db.purchaseOrder.findMany({
    where: { establishmentId: actor.establishment.id, status },
    include: { items: true, supplier: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({
    orders: orders.map(order => ({
      id: order.id,
      supplierId: order.supplierId,
      supplierName: order.supplier?.name ?? null,
      expectedDate: order.expectedDate?.toISOString() ?? null,
      notes: order.notes,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      sentAt: order.sentAt?.toISOString() ?? null,
      generatedNoteId: order.generatedNoteId,
      items: order.items.map(item => ({ id: item.id, inventoryItemId: item.inventoryItemId, quantity: Number(item.quantity), estimatedUnitCost: Number(item.estimatedUnitCost) })),
    })),
  });
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

    if (data.action === "CREATE_ORDER") {
      const order = createLocalPurchaseOrder(session.establishment.id, session.user.id, data);
      recordLocalAudit({ ...localBase, action: "CREATE", entityType: "PurchaseOrder", entityId: order.id, reason: "Ordem de compra criada", after: data });
      return Response.json({ order }, { status: 201 });
    }
    if (data.action === "ADD_ITEM") {
      const result = addLocalPurchaseOrderItem(session.establishment.id, data.orderId, { inventoryItemId: data.establishmentItemId, quantity: data.quantity, estimatedUnitCost: data.estimatedUnitCost });
      if (result === "NOT_FOUND") return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
      if (result === "NOT_DRAFT") return Response.json({ error: "Só é possível editar itens de ordens em rascunho." }, { status: 409 });
      recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "PurchaseOrder", entityId: data.orderId, reason: "Item adicionado à ordem de compra", after: data });
      return Response.json({ order: result });
    }
    if (data.action === "REMOVE_ITEM") {
      const result = removeLocalPurchaseOrderItem(session.establishment.id, data.orderId, data.itemId);
      if (result === "NOT_FOUND") return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
      if (result === "NOT_DRAFT") return Response.json({ error: "Só é possível editar itens de ordens em rascunho." }, { status: 409 });
      if (result === "ITEM_NOT_FOUND") return Response.json({ error: "Item não encontrado nesta ordem." }, { status: 404 });
      recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "PurchaseOrder", entityId: data.orderId, reason: "Item removido da ordem de compra", after: { itemId: data.itemId } });
      return Response.json({ order: result });
    }
    if (data.action === "SEND") {
      const result = sendLocalPurchaseOrder(session.establishment.id, data.orderId);
      if (result === "NOT_FOUND") return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
      if (result === "NOT_DRAFT") return Response.json({ error: "Só é possível enviar ordens em rascunho." }, { status: 409 });
      if (result === "EMPTY") return Response.json({ error: "Adicione ao menos um item antes de enviar." }, { status: 400 });
      recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "PurchaseOrder", entityId: data.orderId, reason: "Ordem de compra enviada ao fornecedor", after: result });
      return Response.json({ order: result });
    }
    if (data.action === "CANCEL") {
      const result = cancelLocalPurchaseOrder(session.establishment.id, data.orderId);
      if (result === "NOT_FOUND") return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
      if (result === "ALREADY_RECEIVED") return Response.json({ error: "Não é possível cancelar uma ordem já recebida." }, { status: 409 });
      if (result === "ALREADY_CANCELLED") return Response.json({ error: "Esta ordem já está cancelada." }, { status: 409 });
      recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "PurchaseOrder", entityId: data.orderId, reason: "Ordem de compra cancelada", after: result });
      return Response.json({ order: result });
    }
    const { orderId, supplierId, expectedDate, notes } = data;
    const result = updateLocalPurchaseOrder(session.establishment.id, orderId, { supplierId, expectedDate, notes });
    if (result === "NOT_FOUND") return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
    if (result === "NOT_DRAFT") return Response.json({ error: "Só é possível editar ordens em rascunho." }, { status: 409 });
    recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "PurchaseOrder", entityId: orderId, reason: "Ordem de compra atualizada", after: { supplierId, expectedDate, notes } });
    return Response.json({ order: result });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });

  try {
    if (data.action === "CREATE_ORDER") {
      if (data.supplierId) {
        const supplier = await db.supplier.findFirst({ where: { id: data.supplierId, organizationId: actor.organization.id } });
        if (!supplier) return Response.json({ error: "Fornecedor inválido." }, { status: 400 });
      }
      const order = await db.$transaction(async tx => {
        const created = await tx.purchaseOrder.create({ data: { establishmentId: actor.establishment.id, supplierId: data.supplierId ?? null, expectedDate: data.expectedDate ? new Date(data.expectedDate) : null, notes: data.notes ?? null, createdById: actor.user.id } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "PurchaseOrder", entityId: created.id, reason: "Ordem de compra criada", ...requestAuditMetadata(request) } });
        return created;
      });
      return Response.json({ order: { id: order.id, status: order.status } }, { status: 201 });
    }

    if (data.action === "ADD_ITEM") {
      const order = await db.purchaseOrder.findFirst({ where: { id: data.orderId, establishmentId: actor.establishment.id } });
      if (!order) return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
      if (order.status !== "DRAFT") return Response.json({ error: "Só é possível editar itens de ordens em rascunho." }, { status: 409 });
      const item = await db.establishmentInventoryItem.findFirst({ where: { id: data.establishmentItemId, establishmentId: actor.establishment.id, inventoryItem: { organizationId: actor.organization.id } } });
      if (!item) return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
      const created = await db.$transaction(async tx => {
        const record = await tx.purchaseOrderItem.create({ data: { orderId: order.id, inventoryItemId: item.id, quantity: data.quantity, estimatedUnitCost: data.estimatedUnitCost } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "PurchaseOrder", entityId: order.id, reason: "Item adicionado à ordem de compra", ...requestAuditMetadata(request) } });
        return record;
      });
      return Response.json({ item: { id: created.id } }, { status: 201 });
    }

    if (data.action === "REMOVE_ITEM") {
      const order = await db.purchaseOrder.findFirst({ where: { id: data.orderId, establishmentId: actor.establishment.id } });
      if (!order) return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
      if (order.status !== "DRAFT") return Response.json({ error: "Só é possível editar itens de ordens em rascunho." }, { status: 409 });
      const item = await db.purchaseOrderItem.findFirst({ where: { id: data.itemId, orderId: order.id } });
      if (!item) return Response.json({ error: "Item não encontrado nesta ordem." }, { status: 404 });
      await db.$transaction(async tx => {
        await tx.purchaseOrderItem.delete({ where: { id: item.id } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "PurchaseOrder", entityId: order.id, reason: "Item removido da ordem de compra", ...requestAuditMetadata(request) } });
      });
      return Response.json({ ok: true });
    }

    if (data.action === "SEND") {
      const order = await db.purchaseOrder.findFirst({ where: { id: data.orderId, establishmentId: actor.establishment.id }, include: { items: true } });
      if (!order) return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
      if (order.status !== "DRAFT") return Response.json({ error: "Só é possível enviar ordens em rascunho." }, { status: 409 });
      if (order.items.length === 0) return Response.json({ error: "Adicione ao menos um item antes de enviar." }, { status: 400 });
      const updated = await db.$transaction(async tx => {
        const record = await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "SENT", sentAt: new Date() } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "PurchaseOrder", entityId: order.id, reason: "Ordem de compra enviada ao fornecedor", ...requestAuditMetadata(request) } });
        return record;
      });
      return Response.json({ order: { id: updated.id, status: updated.status, sentAt: updated.sentAt?.toISOString() ?? null } });
    }

    if (data.action === "CANCEL") {
      const order = await db.purchaseOrder.findFirst({ where: { id: data.orderId, establishmentId: actor.establishment.id } });
      if (!order) return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
      if (order.status === "RECEIVED") return Response.json({ error: "Não é possível cancelar uma ordem já recebida." }, { status: 409 });
      if (order.status === "CANCELLED") return Response.json({ error: "Esta ordem já está cancelada." }, { status: 409 });
      const updated = await db.$transaction(async tx => {
        const record = await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "PurchaseOrder", entityId: order.id, reason: "Ordem de compra cancelada", ...requestAuditMetadata(request) } });
        return record;
      });
      return Response.json({ order: { id: updated.id, status: updated.status } });
    }

    // UPDATE_ORDER
    const order = await db.purchaseOrder.findFirst({ where: { id: data.orderId, establishmentId: actor.establishment.id } });
    if (!order) return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
    if (order.status !== "DRAFT") return Response.json({ error: "Só é possível editar ordens em rascunho." }, { status: 409 });
    if (data.supplierId) {
      const supplier = await db.supplier.findFirst({ where: { id: data.supplierId, organizationId: actor.organization.id } });
      if (!supplier) return Response.json({ error: "Fornecedor inválido." }, { status: 400 });
    }
    const updated = await db.$transaction(async tx => {
      const record = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          supplierId: data.supplierId === undefined ? undefined : data.supplierId,
          expectedDate: data.expectedDate === undefined ? undefined : (data.expectedDate ? new Date(data.expectedDate) : null),
          notes: data.notes === undefined ? undefined : data.notes,
        },
      });
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "PurchaseOrder", entityId: order.id, reason: "Ordem de compra atualizada", ...requestAuditMetadata(request) } });
      return record;
    });
    return Response.json({ order: { id: updated.id, status: updated.status } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return Response.json({ error: "Não foi possível salvar a ordem de compra." }, { status: 400 });
    return Response.json({ error: "Não foi possível salvar a ordem de compra." }, { status: 500 });
  }
}
