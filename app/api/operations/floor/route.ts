import { MembershipStatus, OrderStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { requestAuditMetadata } from "@/lib/audit";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { addLocalTabItem, cancelLocalSentItem, changeLocalOrderStatus, changeLocalTabItem, getLocalFloor, sendLocalOrder } from "@/lib/local-floor";
import { recordLocalAudit } from "@/lib/local-audit";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalCatalog } from "@/lib/local-catalog";
import { resolveIngredientSelections } from "@/lib/ingredient-options";

const optionSelectionSchema = z.object({ groupId: z.string().min(1), optionIds: z.array(z.string().min(1)).max(20) });
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ADD_ITEM"), tableId: z.string().min(1), productId: z.string().min(1), selectedOptions: z.array(optionSelectionSchema).max(10).optional() }),
  z.object({ action: z.literal("CHANGE_ITEM"), tabItemId: z.string().min(1), quantity: z.number().int().min(0).max(999) }),
  z.object({ action: z.literal("CANCEL_SENT_ITEM"), tabItemId: z.string().min(1), quantity: z.number().int().positive().max(999), reason: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal("SEND_ORDER"), tabId: z.string().min(1) }),
  z.object({ action: z.literal("CHANGE_ORDER_STATUS"), orderId: z.string().min(1), status: z.enum(OrderStatus) }),
]);

const floorInclude = {
  tabs: { where: { status: "OPEN" as const }, take: 1, include: { openedBy: { select: { id: true, name: true, username: true } }, items: { where: { active: true }, orderBy: { createdAt: "asc" as const } }, orders: { orderBy: { sentAt: "asc" as const }, include: { sentBy: { select: { id: true, name: true, username: true } }, items: { include: { cancellations: true, tabItem: { select: { productId: true, selectedOptionsSnapshot: true } } } }, statusHistory: { include: { actor: { select: { id: true, name: true, username: true } } }, orderBy: { createdAt: "asc" as const } } } } } },
} satisfies Prisma.DiningTableInclude;

class IngredientOptionError extends Error {}

async function stationLookup(establishmentId: string) {
  const [links, stations] = await Promise.all([
    db.productStation.findMany({ where: { establishmentId } }),
    db.preparationStation.findMany({ where: { establishmentId, active: true }, orderBy: { name: "asc" }, include: { integrations: { where: { category: "PRINTER", active: true }, take: 1 } } }),
  ]);
  return { byProduct: new Map(links.map(link => [link.productId, link.stationId])), stations: stations.map(station => ({ id: station.id, name: station.name, printerDriver: station.integrations[0]?.driver ?? "manual", printerConfig: (station.integrations[0]?.config as Record<string, string>) ?? {} })) };
}

async function actor() {
  const session = await getCurrentSession(); if (!session) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

function serializeTables(tables: Awaited<ReturnType<typeof loadTables>>, byProduct: Map<string, string>) {
  return tables.map(table => { const tab = table.tabs[0]; return { id: table.id, number: table.number, seats: table.seats, name: table.name, area: table.area, assignedWaiterId: table.assignedWaiterId, active: table.active, tab: tab ? { ...tab, items: tab.items.map(item => ({ ...item, quantity: Number(item.quantity), sentQuantity: Number(item.sentQuantity), unitPrice: Number(item.unitPrice) })), orders: tab.orders.map(order => ({ ...order, items: order.items.map(item => ({ ...item, quantity: Number(item.quantity), stationId: byProduct.get(item.tabItem.productId ?? "") ?? null, selectedOptionsSnapshot: item.tabItem.selectedOptionsSnapshot, cancelledQuantity: item.cancellations.reduce((sum, cancellation) => sum + Number(cancellation.quantity), 0), cancellations: item.cancellations.map(cancellation => ({ ...cancellation, quantity: Number(cancellation.quantity) })) })) })) } : null }; });
}

async function loadTables(establishmentId: string, viewer: { userId: string; canManageFloor: boolean }) {
  return db.diningTable.findMany({ where: { establishmentId, active: true, ...(viewer.canManageFloor ? {} : { OR: [{ assignedWaiterId: null }, { assignedWaiterId: viewer.userId }] }) }, include: floorInclude, orderBy: { number: "asc" } });
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) { const session = await getLocalSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 }); if (!session.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 }); return Response.json(getLocalFloor(session.establishment.id, { userId: session.user.id, canManageFloor: session.canManageFloor })); }
  const session = await actor(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 }); if (!session.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 });
  const { byProduct, stations } = await stationLookup(session.establishment.id);
  const tables = serializeTables(await loadTables(session.establishment.id, { userId: session.user.id, canManageFloor: session.canManageFloor }), byProduct);
  const orders = tables.flatMap(table => table.tab?.orders.filter(order => order.status !== "DELIVERED" && order.status !== "CANCELLED").map(order => ({ ...order, tableId: table.id, tableNumber: table.number, tabId: table.tab!.id })) ?? []);
  return Response.json({ tables, orders, stations });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Operação do salão inválida." }, { status: 400 });
  const data = parsed.data;
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 }); if (!session.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 });
    const base = { organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request) };
    if (data.action === "ADD_ITEM") {
      const product = listLocalCatalog(session.establishment.id).find(item => item.id === data.productId && item.channels.includes("FLOOR"));
      if (!product) return Response.json({ error: "Produto indisponível no salão." }, { status: 409 });
      const resolved = resolveIngredientSelections(product.ingredientGroups, data.selectedOptions);
      if ("error" in resolved) return Response.json({ error: resolved.error }, { status: 400 });
      const unitPrice = Math.round((product.price + resolved.priceDelta + Number.EPSILON) * 100) / 100;
      const result = addLocalTabItem({ establishmentId: session.establishment.id, tableId: data.tableId, operatorId: session.user.id, product: { id: product.id, name: product.name }, unitPrice, selectedOptionsSnapshot: resolved.snapshot.length ? resolved.snapshot : undefined });
      if (result === "TABLE_NOT_FOUND") return Response.json({ error: "Mesa não encontrada." }, { status: 404 });
      if (result.opened) recordLocalAudit({ ...base, action: "TAB_OPEN", entityType: "Tab", entityId: result.tab.id, reason: `Comanda aberta na mesa ${result.table.number}`, after: { tableId: result.table.id, tableNumber: result.table.number } });
      recordLocalAudit({ ...base, action: "TAB_ITEM_CHANGE", entityType: "TabItem", entityId: result.item.id, reason: `${product.name} adicionado à mesa ${result.table.number}`, before: { quantity: result.beforeQuantity }, after: { quantity: result.item.quantity, productId: product.id, productName: product.name, unitPrice, selectedOptionsSnapshot: resolved.snapshot } });
      return Response.json(getLocalFloor(session.establishment.id, { userId: session.user.id, canManageFloor: session.canManageFloor }), { status: result.opened ? 201 : 200 });
    }
    if (data.action === "CHANGE_ITEM") { const result = changeLocalTabItem({ establishmentId: session.establishment.id, tabItemId: data.tabItemId, quantity: data.quantity }); if (result === "ITEM_NOT_FOUND") return Response.json({ error: "Item da comanda não encontrado." }, { status: 404 }); if (result === "ALREADY_SENT") return Response.json({ error: "Itens já enviados exigem cancelamento justificado." }, { status: 409 }); recordLocalAudit({ ...base, action: "TAB_ITEM_CHANGE", entityType: "TabItem", entityId: result.item.id, reason: data.quantity === 0 ? `Item removido da mesa ${result.table.number}` : `Quantidade alterada na mesa ${result.table.number}`, before: { quantity: result.beforeQuantity }, after: { quantity: data.quantity, active: data.quantity > 0, productName: result.item.productName } }); return Response.json(getLocalFloor(session.establishment.id, { userId: session.user.id, canManageFloor: session.canManageFloor })); }
    if (data.action === "CANCEL_SENT_ITEM") { if (!session.canCancelSentItems) return Response.json({ error: "Você não tem permissão para cancelar itens enviados." }, { status: 403 }); const result = cancelLocalSentItem({ establishmentId: session.establishment.id, tabItemId: data.tabItemId, quantity: data.quantity, reason: data.reason, actorId: session.user.id }); if (result === "ITEM_NOT_FOUND") return Response.json({ error: "Item da comanda não encontrado." }, { status: 404 }); if (result === "INVALID_CANCEL_QUANTITY") return Response.json({ error: "Quantidade de cancelamento inválida." }, { status: 409 }); recordLocalAudit({ ...base, action: "TAB_ITEM_CANCEL", entityType: "TabItem", entityId: result.item.id, reason: data.reason, before: result.before, after: { quantity: result.item.quantity, sentQuantity: result.item.sentQuantity, cancelledQuantity: data.quantity, tableNumber: result.table.number } }); return Response.json(getLocalFloor(session.establishment.id, { userId: session.user.id, canManageFloor: session.canManageFloor })); }
    if (data.action === "SEND_ORDER") { const result = sendLocalOrder({ establishmentId: session.establishment.id, tabId: data.tabId, operatorId: session.user.id }); if (result === "TAB_NOT_FOUND") return Response.json({ error: "Comanda não encontrada." }, { status: 404 }); if (result === "NOTHING_TO_SEND") return Response.json({ error: "Não há novos itens para enviar." }, { status: 409 }); recordLocalAudit({ ...base, action: "ORDER_SENT", entityType: "Order", entityId: result.order.id, reason: `Pedido enviado para a cozinha — mesa ${result.table.number}`, after: { tabId: result.tab.id, tableNumber: result.table.number, items: result.order.items } }); return Response.json(getLocalFloor(session.establishment.id, { userId: session.user.id, canManageFloor: session.canManageFloor }), { status: 201 }); }
    const result = changeLocalOrderStatus({ establishmentId: session.establishment.id, orderId: data.orderId, status: data.status, actorId: session.user.id }); if (result === "ORDER_NOT_FOUND") return Response.json({ error: "Pedido não encontrado." }, { status: 404 }); if (result === "INVALID_ORDER_TRANSITION") return Response.json({ error: "Esta mudança de etapa não é permitida." }, { status: 409 }); recordLocalAudit({ ...base, action: "ORDER_STATUS_CHANGE", entityType: "Order", entityId: result.order.id, reason: `Etapa do pedido alterada — mesa ${result.table.number}`, before: { status: result.before }, after: { status: result.order.status } }); return Response.json(getLocalFloor(session.establishment.id, { userId: session.user.id, canManageFloor: session.canManageFloor }));
  }

  const session = await actor(); if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 }); if (!session.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 });
  try {
    if (data.action === "ADD_ITEM") await addItem(session, data, request);
    else if (data.action === "CHANGE_ITEM") await changeItem(session, data, request);
    else if (data.action === "CANCEL_SENT_ITEM") { if (!session.canCancelSentItems) return Response.json({ error: "Você não tem permissão para cancelar itens enviados." }, { status: 403 }); await cancelSentItem(session, data, request); }
    else if (data.action === "SEND_ORDER") await sendOrder(session, data, request);
    else await changeOrderStatus(session, data, request);
    const { byProduct, stations } = await stationLookup(session.establishment.id);
    const tables = serializeTables(await loadTables(session.establishment.id, { userId: session.user.id, canManageFloor: session.canManageFloor }), byProduct); const orders = tables.flatMap(table => table.tab?.orders.filter(order => order.status !== "DELIVERED" && order.status !== "CANCELLED").map(order => ({ ...order, tableId: table.id, tableNumber: table.number, tabId: table.tab!.id })) ?? []); return Response.json({ tables, orders, stations });
  } catch (error) {
    if (error instanceof IngredientOptionError) return Response.json({ error: error.message }, { status: 400 });
    const messages: Record<string, [string, number]> = { TABLE_NOT_FOUND: ["Mesa não encontrada.", 404], PRODUCT_NOT_AVAILABLE: ["Produto indisponível no salão.", 409], ITEM_NOT_FOUND: ["Item da comanda não encontrado.", 404], ALREADY_SENT: ["Itens já enviados exigem cancelamento justificado.", 409], INVALID_CANCEL_QUANTITY: ["Quantidade de cancelamento inválida.", 409], TAB_NOT_FOUND: ["Comanda não encontrada.", 404], NOTHING_TO_SEND: ["Não há novos itens para enviar.", 409], ORDER_NOT_FOUND: ["Pedido não encontrado.", 404], INVALID_ORDER_TRANSITION: ["Esta mudança de etapa não é permitida.", 409] };
    const known = error instanceof Error ? messages[error.message] : undefined; if (known) return Response.json({ error: known[0] }, { status: known[1] });
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) return Response.json({ error: "A mesa foi alterada por outra pessoa. Atualize e tente novamente." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar o salão." }, { status: 500 });
  }
}

type Session = NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;
async function addItem(session: Session, data: Extract<z.infer<typeof actionSchema>, { action: "ADD_ITEM" }>, request: Request) {
  await db.$transaction(async tx => {
    const table = await tx.diningTable.findFirst({ where: { id: data.tableId, establishmentId: session.establishment.id, active: true } }); if (!table) throw new Error("TABLE_NOT_FOUND");
    const product = await tx.product.findFirst({ where: { id: data.productId, organizationId: session.organization.id, active: true }, include: { ingredientGroups: { where: { active: true }, include: { options: { where: { active: true } } } }, variants: { where: { isDefault: true, active: true }, take: 1, include: { offerings: { where: { establishmentId: session.establishment.id, channel: "FLOOR", active: true }, take: 1 } } } } });
    const offering = product?.variants[0]?.offerings[0]; if (!product || !offering) throw new Error("PRODUCT_NOT_AVAILABLE");
    const resolved = resolveIngredientSelections(product.ingredientGroups.map(group => ({ id: group.id, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active, options: group.options.map(option => ({ id: option.id, name: option.name, priceDelta: Number(option.priceDelta), active: option.active })) })), data.selectedOptions);
    if ("error" in resolved) throw new IngredientOptionError(resolved.error);
    const unitPrice = Math.round((Number(offering.price) + resolved.priceDelta + Number.EPSILON) * 100) / 100;
    const selectedOptionsSnapshot: Prisma.InputJsonValue | typeof Prisma.JsonNull = resolved.snapshot.length ? resolved.snapshot : Prisma.JsonNull;
    let tab = await tx.tab.findFirst({ where: { tableId: table.id, establishmentId: session.establishment.id, status: "OPEN" } });
    if (!tab) { tab = await tx.tab.create({ data: { establishmentId: session.establishment.id, tableId: table.id, openedById: session.user.id } }); await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "TAB_OPEN", entityType: "Tab", entityId: tab.id, reason: `Comanda aberta na mesa ${table.number}`, after: { tableId: table.id, tableNumber: table.number }, ...requestAuditMetadata(request) } }); }
    // Itens com opções escolhidas nunca são agrupados com outra linha existente — cada personalização
    // vira sua própria linha na comanda, espelhando o critério do carrinho local (lib/local-floor.ts).
    const current = resolved.snapshot.length ? null : await tx.tabItem.findFirst({ where: { tabId: tab.id, productId: product.id, active: true, selectedOptionsSnapshot: { equals: Prisma.JsonNull } } });
    const item = current ? await tx.tabItem.update({ where: { id: current.id }, data: { quantity: { increment: 1 } } }) : await tx.tabItem.create({ data: { tabId: tab.id, productId: product.id, productName: product.name, quantity: 1, unitPrice, selectedOptionsSnapshot, addedById: session.user.id } });
    await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "TAB_ITEM_CHANGE", entityType: "TabItem", entityId: item.id, reason: `${product.name} adicionado à mesa ${table.number}`, before: { quantity: Number(current?.quantity ?? 0) }, after: { quantity: Number(item.quantity), productId: product.id, productName: product.name, unitPrice, selectedOptionsSnapshot: resolved.snapshot, tabId: tab.id, tableNumber: table.number }, ...requestAuditMetadata(request) } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function changeItem(session: Session, data: Extract<z.infer<typeof actionSchema>, { action: "CHANGE_ITEM" }>, request: Request) {
  await db.$transaction(async tx => { const item = await tx.tabItem.findFirst({ where: { id: data.tabItemId, tab: { establishmentId: session.establishment.id, status: "OPEN" } }, include: { tab: { include: { table: true } } } }); if (!item) throw new Error("ITEM_NOT_FOUND"); if (data.quantity < Number(item.sentQuantity)) throw new Error("ALREADY_SENT"); const updated = await tx.tabItem.update({ where: { id: item.id }, data: { quantity: data.quantity, active: data.quantity > 0 } }); await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "TAB_ITEM_CHANGE", entityType: "TabItem", entityId: item.id, reason: data.quantity === 0 ? `Item removido da mesa ${item.tab.table.number}` : `Quantidade alterada na mesa ${item.tab.table.number}`, before: { quantity: Number(item.quantity), active: item.active }, after: { quantity: Number(updated.quantity), active: updated.active, productName: item.productName, tabId: item.tabId, tableNumber: item.tab.table.number }, ...requestAuditMetadata(request) } }); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function cancelSentItem(session: Session, data: Extract<z.infer<typeof actionSchema>, { action: "CANCEL_SENT_ITEM" }>, request: Request) {
  await db.$transaction(async tx => {
    const item = await tx.tabItem.findFirst({ where: { id: data.tabItemId, tab: { establishmentId: session.establishment.id, status: "OPEN" } }, include: { tab: { include: { table: true } } } });
    if (!item) throw new Error("ITEM_NOT_FOUND");
    if (data.quantity > Number(item.sentQuantity)) throw new Error("INVALID_CANCEL_QUANTITY");
    const orderItems = await tx.orderItem.findMany({ where: { tabItemId: item.id }, include: { cancellations: true, order: true }, orderBy: { order: { sentAt: "desc" } } });
    let remaining = data.quantity; const affectedOrderIds = new Set<string>();
    for (const orderItem of orderItems) {
      const available = Number(orderItem.quantity) - orderItem.cancellations.reduce((sum, cancellation) => sum + Number(cancellation.quantity), 0);
      const quantity = Math.min(remaining, available); if (quantity <= 0) continue;
      await tx.orderItemCancellation.create({ data: { orderItemId: orderItem.id, quantity, reason: data.reason, actorId: session.user.id } });
      affectedOrderIds.add(orderItem.orderId); remaining -= quantity; if (remaining === 0) break;
    }
    if (remaining > 0) throw new Error("INVALID_CANCEL_QUANTITY");
    const updated = await tx.tabItem.update({ where: { id: item.id }, data: { quantity: { decrement: data.quantity }, sentQuantity: { decrement: data.quantity }, active: Number(item.quantity) > data.quantity } });
    for (const orderId of affectedOrderIds) {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { include: { cancellations: true } } } });
      if (order && order.status !== "CANCELLED" && order.items.every(orderItem => orderItem.cancellations.reduce((sum, cancellation) => sum + Number(cancellation.quantity), 0) >= Number(orderItem.quantity))) {
        await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
        await tx.orderStatusHistory.create({ data: { orderId: order.id, status: "CANCELLED", actorId: session.user.id } });
      }
    }
    await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "TAB_ITEM_CANCEL", entityType: "TabItem", entityId: item.id, reason: data.reason, before: { quantity: Number(item.quantity), sentQuantity: Number(item.sentQuantity), productName: item.productName }, after: { quantity: Number(updated.quantity), sentQuantity: Number(updated.sentQuantity), cancelledQuantity: data.quantity, tableNumber: item.tab.table.number, affectedOrderIds: [...affectedOrderIds] }, ...requestAuditMetadata(request) } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function sendOrder(session: Session, data: Extract<z.infer<typeof actionSchema>, { action: "SEND_ORDER" }>, request: Request) {
  await db.$transaction(async tx => { const tab = await tx.tab.findFirst({ where: { id: data.tabId, establishmentId: session.establishment.id, status: "OPEN" }, include: { table: true, items: { where: { active: true } } } }); if (!tab) throw new Error("TAB_NOT_FOUND"); const pending = tab.items.map(item => ({ item, quantity: Number(item.quantity) - Number(item.sentQuantity) })).filter(entry => entry.quantity > 0); if (!pending.length) throw new Error("NOTHING_TO_SEND"); const order = await tx.order.create({ data: { tabId: tab.id, sentById: session.user.id, items: { create: pending.map(entry => ({ tabItemId: entry.item.id, productName: entry.item.productName, quantity: entry.quantity })) }, statusHistory: { create: { status: "RECEIVED", actorId: session.user.id } } } }); for (const entry of pending) await tx.tabItem.update({ where: { id: entry.item.id }, data: { sentQuantity: entry.item.quantity } }); await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "ORDER_SENT", entityType: "Order", entityId: order.id, reason: `Pedido enviado para a cozinha — mesa ${tab.table.number}`, after: { tabId: tab.id, tableNumber: tab.table.number, items: pending.map(entry => ({ tabItemId: entry.item.id, productName: entry.item.productName, quantity: entry.quantity })) }, ...requestAuditMetadata(request) } }); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function changeOrderStatus(session: Session, data: Extract<z.infer<typeof actionSchema>, { action: "CHANGE_ORDER_STATUS" }>, request: Request) {
  const next: Partial<Record<OrderStatus, OrderStatus>> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED" };
  await db.$transaction(async tx => { const order = await tx.order.findFirst({ where: { id: data.orderId, tab: { establishmentId: session.establishment.id, status: "OPEN" } }, include: { tab: { include: { table: true } } } }); if (!order) throw new Error("ORDER_NOT_FOUND"); if (next[order.status] !== data.status) throw new Error("INVALID_ORDER_TRANSITION"); const updated = await tx.order.update({ where: { id: order.id }, data: { status: data.status } }); await tx.orderStatusHistory.create({ data: { orderId: order.id, status: data.status, actorId: session.user.id } }); await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "ORDER_STATUS_CHANGE", entityType: "Order", entityId: order.id, reason: `Etapa do pedido alterada — mesa ${order.tab.table.number}`, before: { status: order.status }, after: { status: updated.status, tabId: order.tabId, tableNumber: order.tab.table.number }, ...requestAuditMetadata(request) } }); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
