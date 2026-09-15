import { GoodsReceiptStatus, MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import {
  addLocalGoodsReceiptItem,
  createLocalGoodsReceiptNote,
  listLocalGoodsReceiptNotes,
  removeLocalGoodsReceiptItem,
  updateLocalGoodsReceiptNote,
} from "@/lib/local-goods-receipts";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const createSchema = z.object({
  action: z.literal("CREATE_NOTE"),
  supplierId: z.string().min(1).optional(),
  documentNumber: z.string().trim().max(60).optional(),
  receivedAt: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});
const addItemSchema = z.object({
  action: z.literal("ADD_ITEM"),
  noteId: z.string().min(1),
  establishmentItemId: z.string().min(1),
  quantity: z.number().finite().positive(),
  unitCost: z.number().finite().min(0),
});
const removeItemSchema = z.object({ action: z.literal("REMOVE_ITEM"), noteId: z.string().min(1), itemId: z.string().min(1) });
const updateNoteSchema = z.object({
  action: z.literal("UPDATE_NOTE"),
  noteId: z.string().min(1),
  supplierId: z.string().min(1).nullable().optional(),
  documentNumber: z.string().trim().max(60).nullable().optional(),
  receivedAt: z.string().min(1).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
const actionSchema = z.discriminatedUnion("action", [createSchema, addItemSchema, removeItemSchema, updateNoteSchema]);

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
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const filters: { status?: GoodsReceiptStatus; from?: string; to?: string } = { status: status === "DRAFT" || status === "CONFIRMED" ? status : undefined, from: from ?? undefined, to: to ?? undefined };

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
    return Response.json({ notes: listLocalGoodsReceiptNotes(session.establishment.id, filters) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
  const notes = await db.goodsReceiptNote.findMany({
    where: {
      establishmentId: actor.establishment.id,
      status: filters.status,
      receivedAt: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(`${to}T23:59:59.999`) : undefined } : undefined,
    },
    include: { items: true, supplier: { select: { id: true, name: true } } },
    orderBy: { receivedAt: "desc" },
  });
  return Response.json({
    notes: notes.map(note => ({
      id: note.id,
      supplierId: note.supplierId,
      supplierName: note.supplier?.name ?? null,
      documentNumber: note.documentNumber,
      receivedAt: note.receivedAt.toISOString(),
      notes: note.notes,
      status: note.status,
      createdAt: note.createdAt.toISOString(),
      confirmedAt: note.confirmedAt?.toISOString() ?? null,
      items: note.items.map(item => ({ id: item.id, inventoryItemId: item.inventoryItemId, quantity: Number(item.quantity), unitCost: Number(item.unitCost), stockMovementId: item.stockMovementId })),
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

    if (data.action === "CREATE_NOTE") {
      const note = createLocalGoodsReceiptNote(session.establishment.id, session.user.id, data);
      recordLocalAudit({ ...localBase, action: "CREATE", entityType: "GoodsReceiptNote", entityId: note.id, reason: "Nota de entrada criada", after: data });
      return Response.json({ note }, { status: 201 });
    }
    if (data.action === "ADD_ITEM") {
      const result = addLocalGoodsReceiptItem(session.establishment.id, data.noteId, { inventoryItemId: data.establishmentItemId, quantity: data.quantity, unitCost: data.unitCost });
      if (result === "NOT_FOUND") return Response.json({ error: "Nota de entrada não encontrada." }, { status: 404 });
      if (result === "NOT_DRAFT") return Response.json({ error: "Só é possível editar notas em rascunho." }, { status: 409 });
      recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "GoodsReceiptNote", entityId: data.noteId, reason: "Item adicionado à nota de entrada", after: data });
      return Response.json({ note: result });
    }
    if (data.action === "REMOVE_ITEM") {
      const result = removeLocalGoodsReceiptItem(session.establishment.id, data.noteId, data.itemId);
      if (result === "NOT_FOUND") return Response.json({ error: "Nota de entrada não encontrada." }, { status: 404 });
      if (result === "NOT_DRAFT") return Response.json({ error: "Só é possível editar notas em rascunho." }, { status: 409 });
      if (result === "ITEM_NOT_FOUND") return Response.json({ error: "Item não encontrado nesta nota." }, { status: 404 });
      recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "GoodsReceiptNote", entityId: data.noteId, reason: "Item removido da nota de entrada", after: { itemId: data.itemId } });
      return Response.json({ note: result });
    }
    const { noteId, supplierId, documentNumber, receivedAt, notes } = data;
    const result = updateLocalGoodsReceiptNote(session.establishment.id, noteId, { supplierId, documentNumber, receivedAt, notes });
    if (result === "NOT_FOUND") return Response.json({ error: "Nota de entrada não encontrada." }, { status: 404 });
    if (result === "NOT_DRAFT") return Response.json({ error: "Só é possível editar notas em rascunho." }, { status: 409 });
    recordLocalAudit({ ...localBase, action: "UPDATE", entityType: "GoodsReceiptNote", entityId: noteId, reason: "Nota de entrada atualizada", after: { supplierId, documentNumber, receivedAt, notes } });
    return Response.json({ note: result });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });

  try {
    if (data.action === "CREATE_NOTE") {
      if (data.supplierId) {
        const supplier = await db.supplier.findFirst({ where: { id: data.supplierId, organizationId: actor.organization.id } });
        if (!supplier) return Response.json({ error: "Fornecedor inválido." }, { status: 400 });
      }
      const note = await db.$transaction(async tx => {
        const created = await tx.goodsReceiptNote.create({ data: { establishmentId: actor.establishment.id, supplierId: data.supplierId ?? null, documentNumber: data.documentNumber ?? null, receivedAt: new Date(data.receivedAt), notes: data.notes ?? null, createdById: actor.user.id } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "GoodsReceiptNote", entityId: created.id, reason: "Nota de entrada criada", ...requestAuditMetadata(request) } });
        return created;
      });
      return Response.json({ note: { id: note.id, status: note.status } }, { status: 201 });
    }

    if (data.action === "ADD_ITEM") {
      const note = await db.goodsReceiptNote.findFirst({ where: { id: data.noteId, establishmentId: actor.establishment.id } });
      if (!note) return Response.json({ error: "Nota de entrada não encontrada." }, { status: 404 });
      if (note.status !== "DRAFT") return Response.json({ error: "Só é possível editar notas em rascunho." }, { status: 409 });
      const item = await db.establishmentInventoryItem.findFirst({ where: { id: data.establishmentItemId, establishmentId: actor.establishment.id, inventoryItem: { organizationId: actor.organization.id } } });
      if (!item) return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
      const created = await db.$transaction(async tx => {
        const record = await tx.goodsReceiptItem.create({ data: { noteId: note.id, inventoryItemId: item.id, quantity: data.quantity, unitCost: data.unitCost } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "GoodsReceiptNote", entityId: note.id, reason: "Item adicionado à nota de entrada", ...requestAuditMetadata(request) } });
        return record;
      });
      return Response.json({ item: { id: created.id } }, { status: 201 });
    }

    if (data.action === "REMOVE_ITEM") {
      const note = await db.goodsReceiptNote.findFirst({ where: { id: data.noteId, establishmentId: actor.establishment.id } });
      if (!note) return Response.json({ error: "Nota de entrada não encontrada." }, { status: 404 });
      if (note.status !== "DRAFT") return Response.json({ error: "Só é possível editar notas em rascunho." }, { status: 409 });
      const item = await db.goodsReceiptItem.findFirst({ where: { id: data.itemId, noteId: note.id } });
      if (!item) return Response.json({ error: "Item não encontrado nesta nota." }, { status: 404 });
      await db.$transaction(async tx => {
        await tx.goodsReceiptItem.delete({ where: { id: item.id } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "GoodsReceiptNote", entityId: note.id, reason: "Item removido da nota de entrada", ...requestAuditMetadata(request) } });
      });
      return Response.json({ ok: true });
    }

    // UPDATE_NOTE
    const note = await db.goodsReceiptNote.findFirst({ where: { id: data.noteId, establishmentId: actor.establishment.id } });
    if (!note) return Response.json({ error: "Nota de entrada não encontrada." }, { status: 404 });
    if (note.status !== "DRAFT") return Response.json({ error: "Só é possível editar notas em rascunho." }, { status: 409 });
    if (data.supplierId) {
      const supplier = await db.supplier.findFirst({ where: { id: data.supplierId, organizationId: actor.organization.id } });
      if (!supplier) return Response.json({ error: "Fornecedor inválido." }, { status: 400 });
    }
    const updated = await db.$transaction(async tx => {
      const record = await tx.goodsReceiptNote.update({
        where: { id: note.id },
        data: {
          supplierId: data.supplierId === undefined ? undefined : data.supplierId,
          documentNumber: data.documentNumber === undefined ? undefined : data.documentNumber,
          receivedAt: data.receivedAt === undefined ? undefined : new Date(data.receivedAt),
          notes: data.notes === undefined ? undefined : data.notes,
        },
      });
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "GoodsReceiptNote", entityId: note.id, reason: "Nota de entrada atualizada", ...requestAuditMetadata(request) } });
      return record;
    });
    return Response.json({ note: { id: updated.id, status: updated.status } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return Response.json({ error: "Não foi possível salvar a nota de entrada." }, { status: 400 });
    return Response.json({ error: "Não foi possível salvar a nota de entrada." }, { status: 500 });
  }
}
