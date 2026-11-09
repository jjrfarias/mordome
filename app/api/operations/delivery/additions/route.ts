import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { addToDelivery, deliveryAdditionSchema, DeliveryAdditionError } from "@/lib/delivery-additions";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const session = await getCurrentSession();
  if (!session?.canOperateDelivery) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const input = deliveryAdditionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Confira os itens e a quantidade." }, { status: 400 });
  try {
    return Response.json(await addToDelivery(db, { establishmentId: session.establishment.id, organizationId: session.organization.id, userId: session.user.id }, input.data));
  } catch (error) {
    return Response.json({ error: error instanceof DeliveryAdditionError ? error.message : "Não foi possível acrescentar. Atualize o pedido e tente novamente." }, { status: 409 });
  }
}
