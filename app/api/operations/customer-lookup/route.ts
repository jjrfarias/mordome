import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { findLocalCustomerByPhone } from "@/lib/local-customers";
import { getLocalCustomerOrderStats } from "@/lib/local-delivery";

// Reconhecimento de cliente repetido ao criar um pedido de delivery (ADR 0047): busca só por
// telefone, somente leitura, acessível a quem opera o Delivery (não exige a permissão de gerenciar
// o cadastro de clientes) — o atendente não precisa abrir Configurações para ver se o telefone já
// é conhecido.
export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const phone = new URL(request.url).searchParams.get("phone")?.trim();
  if (!phone || phone.replace(/\D/g, "").length < 8) return Response.json({ customer: null });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canOperateDelivery) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const customer = findLocalCustomerByPhone(session.organization.id, phone);
    if (!customer) return Response.json({ customer: null });
    const stats = getLocalCustomerOrderStats(session.establishment.id, phone);
    return Response.json({ customer: { name: customer.name, ...stats } });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!session.canOperateDelivery) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const customer = await db.customer.findFirst({
    where: { organizationId: session.organization.id, phone: phone.replace(/\D/g, "") },
    include: { deliveryOrders: { select: { status: true, address: true, createdAt: true, sale: { select: { total: true } } } } },
  });
  if (!customer) return Response.json({ customer: null });
  const activeOrders = customer.deliveryOrders.filter(order => order.status !== "CANCELLED");
  const lastOrder = customer.deliveryOrders.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return Response.json({
    customer: {
      name: customer.name,
      ordersCount: activeOrders.length,
      totalSpent: activeOrders.reduce((sum, order) => sum + (order.sale ? Number(order.sale.total) : 0), 0),
      lastAddress: lastOrder?.address ?? null,
    },
  });
}
