import { z } from "zod";
import { db } from "@/lib/db";
import { requestAuditMetadata } from "@/lib/audit";
import { isLocalAuthEnabled, listLocalEstablishments } from "@/lib/local-auth";
import { listLocalCatalog } from "@/lib/local-catalog";
import { createLocalDeliveryOrder } from "@/lib/local-delivery";
import { rateLimit } from "@/lib/rate-limit";

const orderSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().min(8).max(20),
  address: z.string().trim().min(5).max(300),
  destinationLat: z.number().finite().min(-90).max(90).optional(),
  destinationLng: z.number().finite().min(-180).max(180).optional(),
  notes: z.string().trim().max(300).optional(),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive().max(99) })).min(1).max(40),
});

export async function GET(_request: Request, { params }: { params: Promise<{ establishmentId: string }> }) {
  const { establishmentId } = await params;

  if (isLocalAuthEnabled()) {
    const establishment = listLocalEstablishments().find(item => item.id === establishmentId && item.active);
    if (!establishment) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    const products = listLocalCatalog(establishmentId).filter(product => product.active && product.channels.includes("DELIVERY"));
    return Response.json({ establishment: { name: establishment.name }, products: products.map(product => ({ id: product.id, name: product.name, category: product.category, description: null, price: product.price, imageUrl: product.imageUrl })) });
  }

  const establishment = await db.establishment.findFirst({ where: { id: establishmentId, active: true, organization: { active: true } } });
  if (!establishment) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
  const offerings = await db.productOffering.findMany({
    where: { establishmentId, channel: "DELIVERY", active: true, variant: { active: true, product: { organizationId: establishment.organizationId, active: true } } },
    include: { variant: { include: { product: { include: { category: true } } } } },
    orderBy: [{ variant: { product: { category: { sortOrder: "asc" } } } }, { variant: { product: { name: "asc" } } }],
  });
  return Response.json({
    establishment: { name: establishment.name },
    products: offerings.map(offering => ({ id: offering.variant.product.id, name: offering.variant.product.name, category: offering.variant.product.category?.name ?? "Outros", description: offering.variant.product.description, price: Number(offering.price), imageUrl: offering.variant.product.imageUrl })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ establishmentId: string }> }) {
  const { establishmentId } = await params;
  const ip = requestAuditMetadata(request).ipAddress ?? "unknown";
  const limited = rateLimit(`public-order:${ip}`, 5, 10 * 60 * 1000);
  if (!limited.allowed) return Response.json({ error: "Muitos pedidos em pouco tempo. Tente novamente em alguns minutos." }, { status: 429 });

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados do pedido inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const establishment = listLocalEstablishments().find(item => item.id === establishmentId && item.active);
    if (!establishment) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    const catalog = listLocalCatalog(establishmentId);
    const items = data.items.map(item => { const product = catalog.find(candidate => candidate.id === item.productId && candidate.active && candidate.channels.includes("DELIVERY")); return product ? { productId: product.id, productName: product.name, quantity: item.quantity, unitPrice: product.price } : null; });
    if (items.some(item => !item)) return Response.json({ error: "Produto indisponível para pedido online." }, { status: 409 });
    const order = createLocalDeliveryOrder(establishmentId, { customerName: data.customerName, customerPhone: data.customerPhone, address: data.address, destinationLat: data.destinationLat, destinationLng: data.destinationLng, notes: data.notes, origin: "ONLINE", items: items as NonNullable<(typeof items)[number]>[] });
    return Response.json({ orderId: order.id }, { status: 201 });
  }

  const establishment = await db.establishment.findFirst({ where: { id: establishmentId, active: true, organization: { active: true } } });
  if (!establishment) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
  const offerings = await db.productOffering.findMany({ where: { establishmentId, channel: "DELIVERY", active: true, variant: { productId: { in: data.items.map(item => item.productId) }, active: true, product: { organizationId: establishment.organizationId, active: true } } }, include: { variant: { include: { product: true } } } });
  const priceByProduct = new Map(offerings.map(offering => [offering.variant.product.id, { name: offering.variant.product.name, price: Number(offering.price) }]));
  if (data.items.some(item => !priceByProduct.has(item.productId))) return Response.json({ error: "Produto indisponível para pedido online." }, { status: 409 });

  try {
    const order = await db.deliveryOrder.create({ data: { establishmentId, customerName: data.customerName, customerPhone: data.customerPhone, address: data.address, destinationLat: data.destinationLat, destinationLng: data.destinationLng, notes: data.notes, origin: "ONLINE", items: { create: data.items.map(item => { const info = priceByProduct.get(item.productId)!; return { productId: item.productId, productName: info.name, quantity: item.quantity, unitPrice: info.price }; }) } } });
    return Response.json({ orderId: order.id }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível registrar o pedido." }, { status: 500 });
  }
}
