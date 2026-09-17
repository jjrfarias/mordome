import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requestAuditMetadata } from "@/lib/audit";
import { isLocalAuthEnabled, listLocalEstablishments } from "@/lib/local-auth";
import { listLocalUsers } from "@/lib/local-access-control";
import { listLocalCatalog } from "@/lib/local-catalog";
import { attachLocalDeliveryKitchenOrder, createLocalDeliveryOrder } from "@/lib/local-delivery";
import { listLocalDeliveryAreas, getLocalDeliveryArea } from "@/lib/local-delivery-areas";
import { createLocalCounterOrder } from "@/lib/local-floor";
import { rateLimit } from "@/lib/rate-limit";
import { resolveIngredientSelections } from "@/lib/ingredient-options";
import { comboGroupsInclude, mapComboGroupsToIngredientGroups } from "@/lib/combo-catalog";

const optionSelectionSchema = z.object({ groupId: z.string().min(1), optionIds: z.array(z.string().min(1)).max(20) });
const orderSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().min(8).max(20),
  address: z.string().trim().min(5).max(300),
  destinationLat: z.number().finite().min(-90).max(90).optional(),
  destinationLng: z.number().finite().min(-180).max(180).optional(),
  notes: z.string().trim().max(300).optional(),
  deliveryAreaId: z.string().min(1).optional(),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive().max(99), selectedOptions: z.array(optionSelectionSchema).max(10).optional() })).min(1).max(40),
});

export async function GET(_request: Request, { params }: { params: Promise<{ establishmentId: string }> }) {
  const { establishmentId } = await params;

  if (isLocalAuthEnabled()) {
    const establishment = listLocalEstablishments().find(item => item.id === establishmentId && item.active);
    if (!establishment) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    const catalog = listLocalCatalog(establishmentId);
    const products = catalog.filter(product => product.active && product.channels.includes("DELIVERY"));
    const deliveryAreas = listLocalDeliveryAreas(establishmentId).filter(area => area.active);
    const highlightProduct = establishment.highlightProductId ? catalog.find(product => product.id === establishment.highlightProductId) : undefined;
    return Response.json({ establishment: { name: establishment.name, logoUrl: establishment.logoUrl, bannerUrl: establishment.bannerUrl, highlightHeadline: establishment.highlightHeadline, highlightProduct: highlightProduct ? { id: highlightProduct.id, name: highlightProduct.name, price: highlightProduct.price, imageUrl: highlightProduct.imageUrl } : null }, products: products.map(product => ({ id: product.id, name: product.name, category: product.category, description: null, price: product.price, imageUrl: product.imageUrl, ingredientGroups: product.ingredientGroups })), deliveryAreas: deliveryAreas.map(area => ({ id: area.id, name: area.name, deliveryFee: area.deliveryFee })) });
  }

  const establishment = await db.establishment.findFirst({ where: { id: establishmentId, active: true, organization: { active: true } }, include: { highlightProduct: true } });
  if (!establishment) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
  const [offerings, deliveryAreas] = await Promise.all([
    db.productOffering.findMany({
      where: { establishmentId, channel: "DELIVERY", active: true, variant: { active: true, product: { organizationId: establishment.organizationId, active: true } } },
      include: { variant: { include: { product: { include: { category: true, ingredientGroups: { where: { active: true }, include: { options: { where: { active: true } } } }, comboGroups: comboGroupsInclude } } } } },
      orderBy: [{ variant: { product: { category: { sortOrder: "asc" } } } }, { variant: { product: { name: "asc" } } }],
    }),
    db.deliveryArea.findMany({ where: { establishmentId, active: true }, orderBy: { name: "asc" } }),
  ]);
  const highlightOffering = establishment.highlightProduct ? offerings.find(offering => offering.variant.product.id === establishment.highlightProduct!.id) : undefined;
  return Response.json({
    establishment: {
      name: establishment.name,
      logoUrl: establishment.logoUrl,
      bannerUrl: establishment.bannerUrl,
      highlightHeadline: establishment.highlightHeadline,
      highlightProduct: establishment.highlightProduct ? { id: establishment.highlightProduct.id, name: establishment.highlightProduct.name, price: Number(highlightOffering?.price ?? 0), imageUrl: establishment.highlightProduct.imageUrl } : null,
    },
    products: offerings.map(offering => ({
      id: offering.variant.product.id,
      name: offering.variant.product.name,
      category: offering.variant.product.category?.name ?? "Outros",
      description: offering.variant.product.description,
      price: Number(offering.price),
      imageUrl: offering.variant.product.imageUrl,
      ingredientGroups: offering.variant.product.isCombo
        ? mapComboGroupsToIngredientGroups(offering.variant.product.comboGroups)
        : offering.variant.product.ingredientGroups.map(group => ({ id: group.id, productId: group.productId, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active, options: group.options.map(option => ({ id: option.id, name: option.name, priceDelta: Number(option.priceDelta), active: option.active })) })),
    })),
    deliveryAreas: deliveryAreas.map(area => ({ id: area.id, name: area.name, deliveryFee: Number(area.deliveryFee) })),
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
    const resolvedItems = data.items.map(item => {
      const product = catalog.find(candidate => candidate.id === item.productId && candidate.active && candidate.channels.includes("DELIVERY"));
      if (!product) return { error: "Produto indisponível para pedido online." } as const;
      const resolved = resolveIngredientSelections(product.ingredientGroups, item.selectedOptions);
      if ("error" in resolved) return resolved;
      const unitPrice = Math.round((product.price + resolved.priceDelta + Number.EPSILON) * 100) / 100;
      return { productId: product.id, productName: product.name, quantity: item.quantity, unitPrice, selectedOptionsSnapshot: resolved.snapshot.length ? resolved.snapshot : undefined };
    });
    const resolveError = resolvedItems.find(item => "error" in item);
    if (resolveError) return Response.json({ error: resolveError.error }, { status: 409 });
    const items = resolvedItems as Exclude<(typeof resolvedItems)[number], { error: string }>[];
    let deliveryFee = 0;
    if (data.deliveryAreaId) {
      const area = getLocalDeliveryArea(establishmentId, data.deliveryAreaId);
      if (!area || !area.active) return Response.json({ error: "Área de entrega não encontrada." }, { status: 400 });
      deliveryFee = area.deliveryFee;
    }
    const order = createLocalDeliveryOrder(establishmentId, { customerName: data.customerName, customerPhone: data.customerPhone, address: data.address, destinationLat: data.destinationLat, destinationLng: data.destinationLng, notes: data.notes, origin: "ONLINE", deliveryAreaId: data.deliveryAreaId ?? null, deliveryFee, items });
    // Delivery envia para a cozinha (ADR 0050): pedido online é criado sem operador logado, então
    // usa o primeiro usuário ativo com acesso à unidade como autor do tíquete de cozinha — o mesmo
    // critério do ADR 0044 exige um ator, e aqui não existe um atendente por trás do pedido.
    const systemActor = listLocalUsers().find(user => user.userActive && user.establishmentIds.includes(establishmentId));
    if (systemActor) {
      const kitchen = createLocalCounterOrder({ establishmentId, operatorId: systemActor.userId, items: order.items.map(item => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, selectedOptionsSnapshot: item.selectedOptionsSnapshot })) });
      attachLocalDeliveryKitchenOrder(establishmentId, order.id, kitchen.order.id);
    }
    return Response.json({ orderId: order.id }, { status: 201 });
  }

  const establishment = await db.establishment.findFirst({ where: { id: establishmentId, active: true, organization: { active: true } } });
  if (!establishment) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
  const offerings = await db.productOffering.findMany({ where: { establishmentId, channel: "DELIVERY", active: true, variant: { productId: { in: data.items.map(item => item.productId) }, active: true, product: { organizationId: establishment.organizationId, active: true } } }, include: { variant: { include: { product: { include: { ingredientGroups: { where: { active: true }, include: { options: { where: { active: true } } } }, comboGroups: comboGroupsInclude } } } } } });
  const infoByProduct = new Map(offerings.map(offering => [offering.variant.product.id, {
    name: offering.variant.product.name,
    price: Number(offering.price),
    ingredientGroups: offering.variant.product.isCombo
      ? mapComboGroupsToIngredientGroups(offering.variant.product.comboGroups)
      : offering.variant.product.ingredientGroups.map(group => ({ id: group.id, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active, options: group.options.map(option => ({ id: option.id, name: option.name, priceDelta: Number(option.priceDelta), active: option.active })) })),
  }]));
  if (data.items.some(item => !infoByProduct.has(item.productId))) return Response.json({ error: "Produto indisponível para pedido online." }, { status: 409 });
  const resolvedItems = data.items.map(item => { const info = infoByProduct.get(item.productId)!; const resolved = resolveIngredientSelections(info.ingredientGroups, item.selectedOptions); return { item, info, resolved }; });
  const optionError = resolvedItems.find(entry => "error" in entry.resolved);
  if (optionError && "error" in optionError.resolved) return Response.json({ error: optionError.resolved.error }, { status: 400 });
  let deliveryFee = 0;
  if (data.deliveryAreaId) {
    const area = await db.deliveryArea.findFirst({ where: { id: data.deliveryAreaId, establishmentId, active: true } });
    if (!area) return Response.json({ error: "Área de entrega não encontrada." }, { status: 400 });
    deliveryFee = Number(area.deliveryFee);
  }

  try {
    const order = await db.$transaction(async tx => {
      const created = await tx.deliveryOrder.create({ data: { establishmentId, customerName: data.customerName, customerPhone: data.customerPhone, address: data.address, destinationLat: data.destinationLat, destinationLng: data.destinationLng, notes: data.notes, origin: "ONLINE", deliveryAreaId: data.deliveryAreaId, deliveryFee, items: { create: resolvedItems.map(({ item, info, resolved }) => { const priceDelta = "error" in resolved ? 0 : resolved.priceDelta; const snapshot = "error" in resolved ? [] : resolved.snapshot; const unitPrice = Math.round((info.price + priceDelta + Number.EPSILON) * 100) / 100; return { productId: item.productId, productName: info.name, quantity: item.quantity, unitPrice, selectedOptionsSnapshot: snapshot.length ? snapshot : Prisma.JsonNull }; }) } }, include: { items: true } });

      // Delivery envia para a cozinha (ADR 0050): pedido online não tem operador logado por trás,
      // então usa a primeira pessoa com acesso ativo à unidade como autora do tíquete de cozinha
      // (Tab.openedById/Order.sentById exigem um User real) — mesmo critério do modo local.
      const access = await tx.establishmentAccess.findFirst({ where: { establishmentId, membership: { organizationId: establishment.organizationId, status: "ACTIVE" } }, orderBy: { membership: { createdAt: "asc" } }, include: { membership: { select: { userId: true } } } });
      if (access) {
        let counterTable = await tx.diningTable.findFirst({ where: { establishmentId, isCounter: true } });
        if (!counterTable) {
          try {
            counterTable = await tx.diningTable.create({ data: { establishmentId, number: 0, seats: 0, name: "Balcão", isCounter: true } });
          } catch (creationError) {
            if (!(creationError instanceof Prisma.PrismaClientKnownRequestError && creationError.code === "P2002")) throw creationError;
            counterTable = await tx.diningTable.findFirst({ where: { establishmentId, isCounter: true } });
            if (!counterTable) throw creationError;
          }
        }
        const actorId = access.membership.userId;
        const counterTab = await tx.tab.create({ data: { establishmentId, tableId: counterTable.id, openedById: actorId } });
        const tabItems = await Promise.all(created.items.map(item => tx.tabItem.create({ data: { tabId: counterTab.id, productId: item.productId, productName: item.productName, quantity: item.quantity, sentQuantity: item.quantity, unitPrice: item.unitPrice, selectedOptionsSnapshot: item.selectedOptionsSnapshot ?? undefined, addedById: actorId } })));
        const counterOrder = await tx.order.create({ data: { tabId: counterTab.id, sentById: actorId, items: { create: tabItems.map((tabItem, index) => ({ tabItemId: tabItem.id, productName: created.items[index].productName, quantity: created.items[index].quantity })) }, statusHistory: { create: { status: "RECEIVED", actorId } } } });
        await tx.deliveryOrder.update({ where: { id: created.id }, data: { kitchenOrderId: counterOrder.id } });
        await tx.auditEvent.create({ data: { organizationId: establishment.organizationId, establishmentId, actorId, action: "ORDER_SENT", entityType: "Order", entityId: counterOrder.id, reason: `Pedido enviado para a cozinha — Delivery online (${created.customerName})`, after: { tabId: counterTab.id, deliveryOrderId: created.id, items: created.items.map(item => ({ productName: item.productName, quantity: item.quantity })) } } });
      }
      return created;
    });
    return Response.json({ orderId: order.id }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível registrar o pedido." }, { status: 500 });
  }
}
