import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { addLocalStockEntryByEstablishmentItemId } from "@/lib/local-inventory";
import { confirmLocalGoodsReceiptNote } from "@/lib/local-goods-receipts";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const schema = z.object({ noteId: z.string().min(1) });

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
  const { noteId } = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
    const result = confirmLocalGoodsReceiptNote(session.establishment.id, noteId, item => addLocalStockEntryByEstablishmentItemId(session.establishment.id, item.inventoryItemId, item.quantity, item.unitCost));
    if (result === "NOT_FOUND") return Response.json({ error: "Nota de entrada não encontrada." }, { status: 404 });
    if (result === "ALREADY_CONFIRMED") return Response.json({ error: "Esta nota já foi confirmada." }, { status: 409 });
    if (result === "EMPTY") return Response.json({ error: "Adicione ao menos um item antes de confirmar." }, { status: 400 });
    if (result === "ITEM_NOT_FOUND") return Response.json({ error: "Um dos itens da nota não foi encontrado no estoque." }, { status: 404 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request), action: "STOCK_ENTRY", entityType: "GoodsReceiptNote", entityId: noteId, reason: "Nota de entrada confirmada", after: result });
    return Response.json({ note: result });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });

  try {
    const note = await db.$transaction(async tx => {
      const current = await tx.goodsReceiptNote.findFirst({ where: { id: noteId, establishmentId: actor.establishment.id }, include: { items: true } });
      if (!current) throw new Error("NOT_FOUND");
      if (current.status === "CONFIRMED") throw new Error("ALREADY_CONFIRMED");
      if (current.items.length === 0) throw new Error("EMPTY");

      for (const item of current.items) {
        const establishmentItem = await tx.establishmentInventoryItem.findFirst({ where: { id: item.inventoryItemId, establishmentId: actor.establishment.id } });
        if (!establishmentItem) throw new Error("ITEM_NOT_FOUND");
        const movement = await tx.stockMovement.create({
          data: {
            establishmentItemId: establishmentItem.id,
            type: "ENTRY",
            quantity: item.quantity,
            unitCost: item.unitCost,
            actorId: actor.user.id,
            reason: "Nota de entrada confirmada",
            sourceType: "GOODS_RECEIPT_NOTE",
            sourceId: current.id,
          },
        });
        await tx.goodsReceiptItem.update({ where: { id: item.id }, data: { stockMovementId: movement.id } });
      }

      const updated = await tx.goodsReceiptNote.update({ where: { id: current.id }, data: { status: "CONFIRMED", confirmedAt: new Date() }, include: { items: true } });
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "STOCK_ENTRY", entityType: "GoodsReceiptNote", entityId: updated.id, reason: "Nota de entrada confirmada", after: { itemCount: updated.items.length }, ...requestAuditMetadata(request) } });
      return updated;
    });
    return Response.json({ note: { id: note.id, status: note.status, confirmedAt: note.confirmedAt?.toISOString() ?? null } });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Nota de entrada não encontrada." }, { status: 404 });
    if (error instanceof Error && error.message === "ALREADY_CONFIRMED") return Response.json({ error: "Esta nota já foi confirmada." }, { status: 409 });
    if (error instanceof Error && error.message === "EMPTY") return Response.json({ error: "Adicione ao menos um item antes de confirmar." }, { status: 400 });
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") return Response.json({ error: "Um dos itens da nota não foi encontrado no estoque." }, { status: 404 });
    if (error instanceof Prisma.PrismaClientKnownRequestError) return Response.json({ error: "Não foi possível confirmar a nota de entrada." }, { status: 400 });
    return Response.json({ error: "Não foi possível confirmar a nota de entrada." }, { status: 500 });
  }
}
