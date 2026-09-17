import { MembershipStatus, DeliveryStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { requestAuditMetadata } from "@/lib/audit";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignLocalCourier, attachLocalDeliveryKitchenOrder, changeLocalDeliveryStatus, createLocalDeliveryOrder, getLocalCourierLocations, listLocalDeliveryOrders } from "@/lib/local-delivery";
import { cancelLocalCounterOrder, createLocalCounterOrder } from "@/lib/local-floor";
import { findOrCreateLocalCustomerByPhone } from "@/lib/local-customers";
import { getLocalDeliveryArea, listLocalDeliveryAreas } from "@/lib/local-delivery-areas";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalCatalog } from "@/lib/local-catalog";
import { recordLocalAudit } from "@/lib/local-audit";
import { listLocalUsers } from "@/lib/local-access-control";
import { resolveIngredientSelections, type SelectedOptionSnapshot } from "@/lib/ingredient-options";
import { comboGroupsInclude, mapComboGroupsToIngredientGroups } from "@/lib/combo-catalog";

const optionSelectionSchema = z.object({ groupId: z.string().min(1), optionIds: z.array(z.string().min(1)).max(20) });
const createSchema = z.object({
  action: z.literal("CREATE"),
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().trim().min(8).max(20),
  address: z.string().trim().min(5).max(300),
  destinationLat: z.number().finite().min(-90).max(90).optional(),
  destinationLng: z.number().finite().min(-180).max(180).optional(),
  notes: z.string().trim().max(300).optional(),
  deliveryAreaId: z.string().min(1).optional(),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive().max(99), selectedOptions: z.array(optionSelectionSchema).max(10).optional() })).min(1),
});
const statusSchema = z.object({ action: z.literal("CHANGE_STATUS"), orderId: z.string().min(1), status: z.enum(DeliveryStatus) });
const courierSchema = z.object({ action: z.literal("ASSIGN_COURIER"), orderId: z.string().min(1), courierId: z.string().min(1).nullable() });
const actionSchema = z.discriminatedUnion("action", [createSchema, statusSchema, courierSchema]);

const nextStatus: Partial<Record<DeliveryStatus, DeliveryStatus>> = { RECEIVED: "PREPARING", PREPARING: "OUT_FOR_DELIVERY", OUT_FOR_DELIVERY: "DELIVERED" };

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canOperateDelivery) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

function serializeOrder(order: { id: string; customerName: string; customerPhone: string; address: string; destinationLat: number | null; destinationLng: number | null; notes: string | null; status: string; origin: string; courierId: string | null; deliveryAreaId?: string | null; deliveryFee?: unknown; saleId: string | null; createdAt: Date | string; items: { id: string; productId: string | null; productName: string; quantity: number; unitPrice: unknown; selectedOptionsSnapshot?: unknown }[] }) {
  return { id: order.id, customerName: order.customerName, customerPhone: order.customerPhone, address: order.address, destinationLat: order.destinationLat, destinationLng: order.destinationLng, notes: order.notes, status: order.status, origin: order.origin, courierId: order.courierId, deliveryAreaId: order.deliveryAreaId ?? null, deliveryFee: order.deliveryFee !== undefined && order.deliveryFee !== null ? Number(order.deliveryFee) : 0, saleId: order.saleId, createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt, items: order.items.map(item => ({ id: item.id, productId: item.productId, productName: item.productName, quantity: item.quantity, unitPrice: Number(item.unitPrice), selectedOptionsSnapshot: item.selectedOptionsSnapshot ?? null })) };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canOperateDelivery) return Response.json({ error: "Acesso negado ao delivery." }, { status: 403 });
    const products = listLocalCatalog(session.establishment.id).filter(product => product.active && product.channels.includes("DELIVERY")).map(product => ({ id: product.id, name: product.name, category: product.category, price: product.price, ingredientGroups: product.ingredientGroups }));
    const orders = listLocalDeliveryOrders(session.establishment.id);
    const activeCourierIds = [...new Set(orders.filter(order => order.status === "OUT_FOR_DELIVERY" && order.courierId).map(order => order.courierId as string))];
    const couriers = listLocalUsers().filter(user => user.userActive && user.establishmentIds.includes(session.establishment.id)).map(user => ({ id: user.userId, name: user.name }));
    const deliveryAreas = listLocalDeliveryAreas(session.establishment.id);
    return Response.json({ orders, products, couriers, courierLocations: getLocalCourierLocations(activeCourierIds), deliveryAreas, canManageDeliveryAreas: session.canManageCatalog });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const [orders, offerings, accesses, deliveryAreas] = await Promise.all([
    db.deliveryOrder.findMany({ where: { establishmentId: actor.establishment.id }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.productOffering.findMany({ where: { establishmentId: actor.establishment.id, channel: "DELIVERY", active: true, variant: { active: true, product: { organizationId: actor.organization.id, active: true } } }, include: { variant: { include: { product: { include: { category: true, ingredientGroups: { where: { active: true }, include: { options: { where: { active: true } } } }, comboGroups: comboGroupsInclude } } } } } }),
    db.establishmentAccess.findMany({ where: { establishmentId: actor.establishment.id, membership: { organizationId: actor.organization.id, status: MembershipStatus.ACTIVE } }, include: { membership: { include: { user: { select: { id: true, name: true, active: true } } } } } }),
    db.deliveryArea.findMany({ where: { establishmentId: actor.establishment.id, active: true }, orderBy: { name: "asc" } }),
  ]);
  const products = offerings.map(offering => ({ id: offering.variant.product.id, name: offering.variant.product.name, category: offering.variant.product.category?.name ?? "Sem categoria", price: Number(offering.price), ingredientGroups: offering.variant.product.isCombo ? mapComboGroupsToIngredientGroups(offering.variant.product.comboGroups) : offering.variant.product.ingredientGroups.map(group => ({ id: group.id, productId: group.productId, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active, options: group.options.map(option => ({ id: option.id, name: option.name, priceDelta: Number(option.priceDelta), active: option.active })) })) }));
  const couriers = accesses.map(access => access.membership.user).filter(user => user.active).filter((user, index, list) => list.findIndex(candidate => candidate.id === user.id) === index).map(user => ({ id: user.id, name: user.name }));
  const activeCourierIds = [...new Set(orders.filter(order => order.status === "OUT_FOR_DELIVERY" && order.courierId).map(order => order.courierId as string))];
  const courierLocations = activeCourierIds.length ? await db.courierLocation.findMany({ where: { courierId: { in: activeCourierIds } } }) : [];
  return Response.json({ orders: orders.map(serializeOrder), products, couriers, courierLocations: courierLocations.map(location => ({ courierId: location.courierId, lat: location.lat, lng: location.lng, updatedAt: location.updatedAt.toISOString() })), deliveryAreas: deliveryAreas.map(area => ({ ...area, deliveryFee: Number(area.deliveryFee) })), canManageDeliveryAreas: actor.canManageCatalog });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canOperateDelivery) return Response.json({ error: "Acesso negado ao delivery." }, { status: 403 });
    const base = { organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request) };

    if (data.action === "CREATE") {
      const catalog = listLocalCatalog(session.establishment.id);
      type ResolvedItem = { productId: string; productName: string; quantity: number; unitPrice: number; selectedOptionsSnapshot?: SelectedOptionSnapshot[] };
      const items: (ResolvedItem | { error: string } | null)[] = data.items.map(item => {
        const product = catalog.find(candidate => candidate.id === item.productId && candidate.active && candidate.channels.includes("DELIVERY"));
        if (!product) return null;
        const resolved = resolveIngredientSelections(product.ingredientGroups, item.selectedOptions);
        if ("error" in resolved) return { error: resolved.error };
        const unitPrice = Math.round((product.price + resolved.priceDelta + Number.EPSILON) * 100) / 100;
        return { productId: product.id, productName: product.name, quantity: item.quantity, unitPrice, selectedOptionsSnapshot: resolved.snapshot.length ? resolved.snapshot : undefined };
      });
      if (items.some(item => !item)) return Response.json({ error: "Produto indisponível no delivery." }, { status: 409 });
      const optionError = items.find(item => item && "error" in item) as { error: string } | undefined;
      if (optionError) return Response.json({ error: optionError.error }, { status: 400 });
      let deliveryFee = 0;
      if (data.deliveryAreaId) {
        const area = getLocalDeliveryArea(session.establishment.id, data.deliveryAreaId);
        if (!area || !area.active) return Response.json({ error: "Área de entrega não encontrada." }, { status: 400 });
        deliveryFee = area.deliveryFee;
      }
      // Reconhecimento de cliente repetido (ADR 0047): encontra pelo telefone ou cadastra na hora.
      const customer = findOrCreateLocalCustomerByPhone(session.organization.id, { name: data.customerName, phone: data.customerPhone });
      const order = createLocalDeliveryOrder(session.establishment.id, { customerName: data.customerName, customerPhone: data.customerPhone, customerId: customer.id, address: data.address, destinationLat: data.destinationLat, destinationLng: data.destinationLng, notes: data.notes, createdById: session.user.id, deliveryAreaId: data.deliveryAreaId ?? null, deliveryFee, items: items as ResolvedItem[] });
      recordLocalAudit({ ...base, action: "CREATE", entityType: "DeliveryOrder", entityId: order.id, reason: `Pedido de delivery criado para ${order.customerName}`, after: { customerName: order.customerName, address: order.address, items: order.items } });
      // Delivery envia para a cozinha: mesmo pipeline da mesa virtual "Balcão" do PDV (ADR 0044),
      // já no momento do pedido (não do pagamento) — ver comentário equivalente no modo Prisma.
      const kitchen = createLocalCounterOrder({ establishmentId: session.establishment.id, operatorId: session.user.id, items: order.items.map(item => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, selectedOptionsSnapshot: item.selectedOptionsSnapshot })) });
      attachLocalDeliveryKitchenOrder(session.establishment.id, order.id, kitchen.order.id);
      recordLocalAudit({ ...base, action: "ORDER_SENT", entityType: "Order", entityId: kitchen.order.id, reason: `Pedido enviado para a cozinha — Delivery (${order.customerName})`, after: { deliveryOrderId: order.id, items: order.items.map(item => ({ productName: item.productName, quantity: item.quantity })) } });
      return Response.json({ order: { ...order, kitchenOrderId: kitchen.order.id } }, { status: 201 });
    }
    if (data.action === "CHANGE_STATUS") {
      const result = changeLocalDeliveryStatus(session.establishment.id, data.orderId, data.status, kitchenOrderId => cancelLocalCounterOrder(session.establishment.id, kitchenOrderId, session.user.id));
      if (result === "NOT_FOUND") return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
      if (result === "INVALID_TRANSITION") return Response.json({ error: "Esta mudança de etapa não é permitida." }, { status: 409 });
      recordLocalAudit({ ...base, action: "UPDATE", entityType: "DeliveryOrder", entityId: result.order.id, reason: `Etapa do delivery alterada`, before: { status: result.before }, after: { status: result.order.status } });
      return Response.json({ order: result.order });
    }
    const result = assignLocalCourier(session.establishment.id, data.orderId, data.courierId);
    if (result === "NOT_FOUND") return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    recordLocalAudit({ ...base, action: "UPDATE", entityType: "DeliveryOrder", entityId: result.id, reason: "Entregador atribuído ao pedido", after: { courierId: result.courierId } });
    return Response.json({ order: result });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  if (data.action === "CREATE") {
    try {
      const offerings = await db.productOffering.findMany({ where: { establishmentId: actor.establishment.id, channel: "DELIVERY", active: true, variant: { productId: { in: data.items.map(item => item.productId) }, active: true, product: { organizationId: actor.organization.id, active: true } } }, include: { variant: { include: { product: { include: { ingredientGroups: { where: { active: true }, include: { options: { where: { active: true } } } }, comboGroups: comboGroupsInclude } } } } } });
      const infoByProduct = new Map(offerings.map(offering => [offering.variant.product.id, { name: offering.variant.product.name, price: Number(offering.price), ingredientGroups: offering.variant.product.isCombo ? mapComboGroupsToIngredientGroups(offering.variant.product.comboGroups) : offering.variant.product.ingredientGroups.map(group => ({ id: group.id, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active, options: group.options.map(option => ({ id: option.id, name: option.name, priceDelta: Number(option.priceDelta), active: option.active })) })) }]));
      if (data.items.some(item => !infoByProduct.has(item.productId))) return Response.json({ error: "Produto indisponível no delivery." }, { status: 409 });
      const resolvedItems = data.items.map(item => { const info = infoByProduct.get(item.productId)!; const resolved = resolveIngredientSelections(info.ingredientGroups, item.selectedOptions); return { item, info, resolved }; });
      const optionError = resolvedItems.find(entry => "error" in entry.resolved);
      if (optionError && "error" in optionError.resolved) return Response.json({ error: optionError.resolved.error }, { status: 400 });
      let deliveryFee = 0;
      if (data.deliveryAreaId) {
        const area = await db.deliveryArea.findFirst({ where: { id: data.deliveryAreaId, establishmentId: actor.establishment.id, active: true } });
        if (!area) return Response.json({ error: "Área de entrega não encontrada." }, { status: 400 });
        deliveryFee = Number(area.deliveryFee);
      }
      const order = await db.$transaction(async tx => {
        // Reconhecimento de cliente repetido (ADR 0047): encontra pelo telefone (normalizado,
        // dígitos apenas) ou cadastra na hora — nunca exige um passo manual de cadastro antes.
        const normalizedPhone = data.customerPhone.replace(/\D/g, "");
        const customer = await tx.customer.upsert({
          where: { organizationId_phone: { organizationId: actor.organization.id, phone: normalizedPhone } },
          update: { name: data.customerName },
          create: { organizationId: actor.organization.id, name: data.customerName, phone: normalizedPhone },
        });
        const created = await tx.deliveryOrder.create({ data: { establishmentId: actor.establishment.id, customerName: data.customerName, customerPhone: data.customerPhone, customerId: customer.id, address: data.address, destinationLat: data.destinationLat, destinationLng: data.destinationLng, notes: data.notes, createdById: actor.user.id, deliveryAreaId: data.deliveryAreaId, deliveryFee, items: { create: resolvedItems.map(({ item, info, resolved }) => { const priceDelta = "error" in resolved ? 0 : resolved.priceDelta; const snapshot = "error" in resolved ? [] : resolved.snapshot; const unitPrice = Math.round((info.price + priceDelta + Number.EPSILON) * 100) / 100; return { productId: item.productId, productName: info.name, quantity: item.quantity, unitPrice, selectedOptionsSnapshot: snapshot.length ? snapshot : Prisma.JsonNull }; }) } }, include: { items: true } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "CREATE", entityType: "DeliveryOrder", entityId: created.id, reason: `Pedido de delivery criado para ${created.customerName}`, after: { customerName: created.customerName, address: created.address, items: created.items.map(item => ({ productName: item.productName, quantity: item.quantity, unitPrice: Number(item.unitPrice), selectedOptionsSnapshot: item.selectedOptionsSnapshot })) } } });

        // Delivery envia para a cozinha: mesmo pipeline Tab -> Order -> OrderItem do PDV (ADR 0044),
        // via a mesa virtual "Balcão" — mas, diferente do PDV, a comanda é criada já no pedido (não
        // no pagamento), porque a cozinha precisa preparar antes de o pedido sair para entrega e ser
        // pago. Fica OPEN indefinidamente (nunca fechada por aqui); `kitchenOrderId` liga de volta
        // para o pedido de delivery só para referência — nada no fluxo de pagamento depende dele.
        let counterTable = await tx.diningTable.findFirst({ where: { establishmentId: actor.establishment.id, isCounter: true } });
        if (!counterTable) {
          try {
            counterTable = await tx.diningTable.create({ data: { establishmentId: actor.establishment.id, number: 0, seats: 0, name: "Balcão", isCounter: true } });
          } catch (creationError) {
            if (!(creationError instanceof Prisma.PrismaClientKnownRequestError && creationError.code === "P2002")) throw creationError;
            counterTable = await tx.diningTable.findFirst({ where: { establishmentId: actor.establishment.id, isCounter: true } });
            if (!counterTable) throw creationError;
          }
        }
        const counterTab = await tx.tab.create({ data: { establishmentId: actor.establishment.id, tableId: counterTable.id, openedById: actor.user.id } });
        const tabItems = await Promise.all(created.items.map(item => tx.tabItem.create({ data: { tabId: counterTab.id, productId: item.productId, productName: item.productName, quantity: item.quantity, sentQuantity: item.quantity, unitPrice: item.unitPrice, selectedOptionsSnapshot: item.selectedOptionsSnapshot ?? undefined, addedById: actor.user.id } })));
        const counterOrder = await tx.order.create({ data: { tabId: counterTab.id, sentById: actor.user.id, items: { create: tabItems.map((tabItem, index) => ({ tabItemId: tabItem.id, productName: created.items[index].productName, quantity: created.items[index].quantity })) }, statusHistory: { create: { status: "RECEIVED", actorId: actor.user.id } } } });
        await tx.deliveryOrder.update({ where: { id: created.id }, data: { kitchenOrderId: counterOrder.id } });
        await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "ORDER_SENT", entityType: "Order", entityId: counterOrder.id, reason: `Pedido enviado para a cozinha — Delivery (${created.customerName})`, after: { tabId: counterTab.id, deliveryOrderId: created.id, items: created.items.map(item => ({ productName: item.productName, quantity: item.quantity })) } } });
        return created;
      });
      return Response.json({ order: serializeOrder(order) }, { status: 201 });
    } catch {
      return Response.json({ error: "Não foi possível criar o pedido de delivery." }, { status: 500 });
    }
  }

  if (data.action === "CHANGE_STATUS") {
    const current = await db.deliveryOrder.findFirst({ where: { id: data.orderId, establishmentId: actor.establishment.id } });
    if (!current) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    const validTransition = data.status === "CANCELLED" ? current.status !== "DELIVERED" && current.status !== "CANCELLED" : nextStatus[current.status] === data.status;
    if (!validTransition) return Response.json({ error: "Esta mudança de etapa não é permitida." }, { status: 409 });
    const updated = await db.$transaction(async tx => {
      const result = await tx.deliveryOrder.update({ where: { id: current.id }, data: { status: data.status } });
      if (data.status === "CANCELLED" && current.kitchenOrderId) {
        await tx.order.update({ where: { id: current.kitchenOrderId }, data: { status: "CANCELLED" } });
        await tx.orderStatusHistory.create({ data: { orderId: current.kitchenOrderId, status: "CANCELLED", actorId: actor.user.id } });
      }
      await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "DeliveryOrder", entityId: current.id, reason: "Etapa do delivery alterada", before: { status: current.status }, after: { status: result.status } } });
      return result;
    });
    return Response.json({ order: { ...updated, items: [] } });
  }

  if (data.courierId) {
    const access = await db.establishmentAccess.findFirst({ where: { establishmentId: actor.establishment.id, membership: { userId: data.courierId, organizationId: actor.organization.id, status: MembershipStatus.ACTIVE } } });
    if (!access) return Response.json({ error: "Usuário sem acesso a esta unidade." }, { status: 400 });
  }
  const current = await db.deliveryOrder.findFirst({ where: { id: data.orderId, establishmentId: actor.establishment.id } });
  if (!current) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
  const updated = await db.$transaction(async tx => {
    const result = await tx.deliveryOrder.update({ where: { id: current.id }, data: { courierId: data.courierId } });
    await tx.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "DeliveryOrder", entityId: current.id, reason: "Entregador atribuído ao pedido", after: { courierId: data.courierId } } });
    return result;
  });
  return Response.json({ order: { ...updated, items: [] } });
}
