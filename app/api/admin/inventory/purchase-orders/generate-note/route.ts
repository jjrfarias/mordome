import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { generateLocalGoodsReceiptFromPurchaseOrder } from "@/lib/local-purchase-orders";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const schema = z.object({ orderId: z.string().min(1) });

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
  const { orderId } = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
    const result = generateLocalGoodsReceiptFromPurchaseOrder(session.establishment.id, orderId, session.user.id);
    if (result === "NOT_FOUND") return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
    if (result === "ALREADY_RECEIVED") return Response.json({ error: "Esta ordem já gerou uma nota de entrada." }, { status: 409 });
    if (result === "CANCELLED") return Response.json({ error: "Não é possível gerar nota de uma ordem cancelada." }, { status: 409 });
    if (result === "EMPTY") return Response.json({ error: "Adicione ao menos um item antes de gerar a nota." }, { status: 400 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request), action: "CREATE", entityType: "PurchaseOrder", entityId: orderId, reason: "Nota de entrada gerada a partir de ordem de compra", after: { noteId: result.note.id } });
    return Response.json({ order: result.order, note: result.note });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });

  try {
    const result = await db.$transaction(async tx => {
      const order = await tx.purchaseOrder.findFirst({ where: { id: orderId, establishmentId: actor.establishment.id }, include: { items: true } });
      if (!order) throw new Error("NOT_FOUND");
      if (order.status === "RECEIVED") throw new Error("ALREADY_RECEIVED");
      if (order.status === "CANCELLED") throw new Error("CANCELLED");
      if (order.items.length === 0) throw new Error("EMPTY");

      const note = await tx.goodsReceiptNote.create({
        data: {
          establishmentId: actor.establishment.id,
          supplierId: order.supplierId,
          notes: order.notes ? `Gerada a partir da ordem de compra: ${order.notes}` : "Gerada a partir de uma ordem de compra",
          receivedAt: order.expectedDate ?? new Date(),
          createdById: actor.user.id,
        },
      });
      for (const item of order.items) {
        await tx.goodsReceiptItem.create({ data: { noteId: note.id, inventoryItemId: item.inventoryItemId, quantity: item.quantity, unitCost: item.estimatedUnitCost } });
      }
      const updatedOrder = await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "RECEIVED", generatedNoteId: note.id } });
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "PurchaseOrder", entityId: order.id, reason: "Nota de entrada gerada a partir de ordem de compra", after: { noteId: note.id }, ...requestAuditMetadata(request) } });
      return { order: updatedOrder, note };
    });
    return Response.json({ order: { id: result.order.id, status: result.order.status, generatedNoteId: result.order.generatedNoteId }, note: { id: result.note.id, status: result.note.status } });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Ordem de compra não encontrada." }, { status: 404 });
    if (error instanceof Error && error.message === "ALREADY_RECEIVED") return Response.json({ error: "Esta ordem já gerou uma nota de entrada." }, { status: 409 });
    if (error instanceof Error && error.message === "CANCELLED") return Response.json({ error: "Não é possível gerar nota de uma ordem cancelada." }, { status: 409 });
    if (error instanceof Error && error.message === "EMPTY") return Response.json({ error: "Adicione ao menos um item antes de gerar a nota." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError) return Response.json({ error: "Não foi possível gerar a nota de entrada." }, { status: 400 });
    return Response.json({ error: "Não foi possível gerar a nota de entrada." }, { status: 500 });
  }
}
