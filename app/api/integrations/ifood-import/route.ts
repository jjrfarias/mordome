import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLocalAuthEnabled } from "@/lib/local-auth";
import { ifoodImportSchema, ifoodImportProblem } from "@/lib/ifood-import";
import { importIfoodOrder } from "@/lib/ifood-import-service";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { setKitchenStage } from "@/lib/delivery-kitchen";

export async function PATCH(request: Request) {
  if (!request.headers.get("origin") || !isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const session = await getCurrentSession();
  if (!session?.canOperateDelivery) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = z.object({ orderId: z.string().min(1).max(100) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    const result = await db.$transaction(async tx => {
      const order = await tx.deliveryOrder.findFirst({ where: { id: parsed.data.orderId, establishmentId: session.establishment.id, origin: { in: ["IFOOD", "FOOD99"] }, status: "PREPARING" } });
      if (!order?.kitchenOrderId) return false;
      const kitchen = await tx.order.findFirst({ where: { id: order.kitchenOrderId, status: "READY", tab: { establishmentId: session.establishment.id } } });
      if (!kitchen) return false;
      await setKitchenStage(tx, { establishmentId: session.establishment.id, organizationId: session.organization.id, actorId: session.user.id }, kitchen.id, "DELIVERED", "Retirada do pedido do marketplace; encerramento apenas da produção no Mordomê");
      await tx.deliveryOrder.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return result ? Response.json({ ok: true }) : Response.json({ error: "Pedido indisponível ou ainda não está pronto na cozinha." }, { status: 409 });
  } catch {
    return Response.json({ error: "O pedido mudou. Atualize a tela e tente novamente." }, { status: 409 });
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("origin") || !isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) return Response.json({ error: "A importação exige o banco persistente do Mordomê. Não está disponível na demonstração em memória." }, { status: 409 });
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Entre no Mordomê e tente novamente." }, { status: 401 });
  if (!session.canOperateDelivery) return Response.json({ error: "Sem permissão para operar delivery." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 65000) return Response.json({ error: "Pedido excede o limite de importação." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Pedido inválido." }, { status: 400 }); }
  const parsed = ifoodImportSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Pedido incompleto. Reabra os detalhes no Gestor e capture novamente." }, { status: 400 });
  if (parsed.data.establishmentId !== session.establishment.id) return Response.json({ error: "A loja selecionada mudou. Recarregue e confira a loja antes de importar." }, { status: 409 });
  try {
    const result = await importIfoodOrder(db, { establishmentId: session.establishment.id, organizationId: session.organization.id, userId: session.user.id }, parsed.data.order);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    // Only validation messages are safe for the operator; never expose database details.
    const problem = ifoodImportProblem(parsed.data.order);
    if (problem && error instanceof Error && error.message === problem) return Response.json({ error: problem }, { status: 409 });
    console.error({ event: "ifood_import_failed", establishmentId: session.establishment.id });
    return Response.json({ error: "Não foi possível importar. Pode tentar novamente: o mesmo pedido não será duplicado." }, { status: 500 });
  }
}
