import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listLocalDeliveryOrders, setLocalCourierLocation } from "@/lib/local-delivery";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";

const pingSchema = z.object({ action: z.literal("PING"), lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canDeliverOrders) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

function serializeOrder(order: { id: string; customerName: string; customerPhone: string; address: string; destinationLat: number | null; destinationLng: number | null; status: string; items: { id: string; productName: string; quantity: number; unitPrice: unknown }[] }) {
  return { id: order.id, customerName: order.customerName, customerPhone: order.customerPhone, address: order.address, destinationLat: order.destinationLat, destinationLng: order.destinationLng, status: order.status, items: order.items.map(item => ({ id: item.id, productName: item.productName, quantity: item.quantity, unitPrice: Number(item.unitPrice) })) };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canDeliverOrders) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const orders = listLocalDeliveryOrders(session.establishment.id).filter(order => order.courierId === session.user.id && (order.status === "PREPARING" || order.status === "OUT_FOR_DELIVERY"));
    return Response.json({ orders: orders.map(serializeOrder) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const orders = await db.deliveryOrder.findMany({ where: { establishmentId: actor.establishment.id, courierId: actor.user.id, status: { in: ["PREPARING", "OUT_FOR_DELIVERY"] } }, include: { items: true }, orderBy: { createdAt: "asc" } });
  return Response.json({ orders: orders.map(serializeOrder) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = pingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Coordenadas inválidas." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canDeliverOrders) return Response.json({ error: "Acesso negado." }, { status: 403 });
    setLocalCourierLocation(session.user.id, data.lat, data.lng);
    return Response.json({ ok: true });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  await db.courierLocation.upsert({ where: { courierId: actor.user.id }, create: { courierId: actor.user.id, lat: data.lat, lng: data.lng }, update: { lat: data.lat, lng: data.lng } });
  return Response.json({ ok: true });
}
