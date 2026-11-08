import { deliveryFinished } from "./delivery-workflow.ts";
import { randomUUID } from "node:crypto";
import { getLocalProductStation, listLocalStations } from "./local-stations.ts";
import { syncLocalDeliveryPreparation, listLocalDeliveryOrders } from "./local-delivery.ts";
import { kitchenReportLabel } from "./kitchen-label.ts";
import type { SelectedOptionSnapshot } from "./ingredient-options.ts";

export type LocalOrderStatus = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
type LocalTabItem = { id: string; productId: string; productName: string; quantity: number; sentQuantity: number; unitPrice: number; active: boolean; addedById: string; selectedOptionsSnapshot?: SelectedOptionSnapshot[] };
type LocalOrderItem = { id: string; tabItemId: string; productName: string; quantity: number; selectedOptionsSnapshot?: SelectedOptionSnapshot[]; cancellations: { id: string; quantity: number; reason: string; actorId: string; createdAt: string }[] };
type LocalOrderStatusHistoryEntry = { status: LocalOrderStatus; actorId: string; createdAt: string };
type LocalOrder = { id: string; status: LocalOrderStatus; sentById: string; sentAt: string; items: LocalOrderItem[]; statusHistory: LocalOrderStatusHistoryEntry[] };
type LocalTab = { id: string; name?: string; status: "OPEN" | "PAID" | "CANCELLED"; openedById: string; openedAt: string; closedAt?: string; saleId?: string; items: LocalTabItem[]; orders: LocalOrder[] };
type LocalTable = { id: string; number: number; seats: number; name: string | null; area: string | null; assignedWaiterId: string | null; active: boolean; tabs: LocalTab[] };

const stores = new Map<string, LocalTable[]>();
const tablesFor = (establishmentId: string) => {
  if (!stores.has(establishmentId)) stores.set(establishmentId, Array.from({ length: 12 }, (_, index) => ({ id: `local-table-${establishmentId}-${index + 1}`, number: index + 1, seats: 4, name: null, area: null, assignedWaiterId: null, active: true, tabs: [] })));
  return stores.get(establishmentId)!;
};

// Pedidos do PDV (ADR 0044): sem mesa/comanda por trás em modo local — a mesa virtual "Balcão" só
// existe no schema do servidor (`DiningTable.isCounter`) porque lá `Order`/`OrderItem` exigem uma
// `Tab` por trás. Em modo local não há essa amarra, então um pedido de balcão é só um `LocalOrder`
// numa lista própria por estabelecimento, sem passar por `LocalTable`/`LocalTab` nenhum.
type LocalCounterOrderItem = { id: string; productId: string; productName: string; quantity: number; selectedOptionsSnapshot?: SelectedOptionSnapshot[] };
type LocalCounterOrder = { id: string; status: LocalOrderStatus; sentById: string; sentAt: string; items: LocalCounterOrderItem[]; statusHistory: LocalOrderStatusHistoryEntry[] };
const counterOrderStores = new Map<string, LocalCounterOrder[]>();
const counterOrdersFor = (establishmentId: string) => {
  if (!counterOrderStores.has(establishmentId)) counterOrderStores.set(establishmentId, []);
  return counterOrderStores.get(establishmentId)!;
};

export function createLocalCounterOrder(input: { establishmentId: string; operatorId: string; items: { productId: string; productName: string; quantity: number; selectedOptionsSnapshot?: SelectedOptionSnapshot[] }[] }) {
  const sentAt = new Date().toISOString();
  const order: LocalCounterOrder = { id: `local-order-${randomUUID()}`, status: "RECEIVED", sentById: input.operatorId, sentAt, items: input.items.map(item => ({ id: `local-order-item-${randomUUID()}`, productId: item.productId, productName: item.productName, quantity: item.quantity, selectedOptionsSnapshot: item.selectedOptionsSnapshot })), statusHistory: [{ status: "RECEIVED", actorId: input.operatorId, createdAt: sentAt }] };
  counterOrdersFor(input.establishmentId).push(order);
  // Mesmo critério de agrupamento por fila do modo servidor: produto sem fila configurada não
  // entra em nenhum tíquete (não é erro, só não passa por preparo — ex.: bebida engarrafada).
  const stations = new Map(listLocalStations(input.establishmentId).map(station => [station.id, station]));
  const grouped = new Map<string, { stationName: string; printerDriver: string; items: { name: string; quantity: number }[] }>();
  for (const item of order.items) {
    const stationId = getLocalProductStation(input.establishmentId, item.productId); if (!stationId) continue;
    const station = stations.get(stationId); if (!station) continue;
    if (!grouped.has(stationId)) grouped.set(stationId, { stationName: station.name, printerDriver: station.printerDriver, items: [] });
    grouped.get(stationId)!.items.push({ name: item.productName, quantity: item.quantity });
  }
  return { order, kitchenTicket: { orderId: order.id, sentAt, tickets: [...grouped.values()] } };
}

export function listLocalTables(establishmentId: string) {
  return tablesFor(establishmentId).map(table => ({ id: table.id, number: table.number, seats: table.seats, name: table.name, area: table.area, assignedWaiterId: table.assignedWaiterId, active: table.active }));
}

export function createLocalTables(establishmentId: string, input: { area: string | null; seats: number; quantity: number }) {
  const tables = tablesFor(establishmentId);
  const nextNumber = tables.reduce((max, table) => Math.max(max, table.number), 0) + 1;
  const created: LocalTable[] = [];
  for (let index = 0; index < input.quantity; index += 1) {
    const table: LocalTable = { id: `local-table-${randomUUID()}`, number: nextNumber + index, seats: input.seats, name: null, area: input.area, assignedWaiterId: null, active: true, tabs: [] };
    tables.push(table); created.push(table);
  }
  return created.map(table => ({ id: table.id, number: table.number, seats: table.seats, name: table.name, area: table.area, assignedWaiterId: table.assignedWaiterId, active: table.active }));
}

export function updateLocalTable(establishmentId: string, tableId: string, data: { name?: string | null; area?: string | null; seats?: number; active?: boolean; assignedWaiterId?: string | null }) {
  const table = tablesFor(establishmentId).find(candidate => candidate.id === tableId);
  if (!table) return "NOT_FOUND" as const;
  const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  Object.assign(table, defined);
  return { id: table.id, number: table.number, seats: table.seats, name: table.name, area: table.area, assignedWaiterId: table.assignedWaiterId, active: table.active };
}

export function getLocalFloor(establishmentId: string, viewer?: { userId: string; canManageFloor: boolean }) {
  const scoped = tablesFor(establishmentId).filter(table => table.active && (!viewer || viewer.canManageFloor || !table.assignedWaiterId || table.assignedWaiterId === viewer.userId));
  const tables = scoped.map(table => {
    const serialize = (tab: LocalTab) => ({ ...tab, items: tab.items.filter(item => item.active), orders: tab.orders.map(order => ({ ...order, tabName: tab.name ?? "", items: order.items.map(item => { const tabItem = table.tabs.flatMap(candidate => candidate.items).find(candidate => candidate.id === item.tabItemId); const stationId = tabItem ? getLocalProductStation(establishmentId, tabItem.productId) : null; return { ...item, stationId, cancelledQuantity: item.cancellations.reduce((sum, cancellation) => sum + cancellation.quantity, 0) }; }) })) });
    const tabs = table.tabs.filter(tab => tab.status === "OPEN").map(serialize);
    const kitchenOrders = table.tabs.filter(tab => tab.status === "OPEN").map(serialize).flatMap(tab => tab.orders.filter(order => !["DELIVERED", "CANCELLED"].includes(order.status)).map(order => ({ ...order, tableId: table.id, tableNumber: table.number, tabId: tab.id, isCounter: false, delivery: null })));
    return { ...table, tabs, tab: tabs[0] ?? null, kitchenOrders };
  });
  const tableOrders = tables.flatMap(table => table.kitchenOrders);
  // Delivery também chega pela mesa virtual "Balcão" (ADR 0050); o vínculo kitchenOrderId o identifica.
  const deliveries = listLocalDeliveryOrders(establishmentId).filter(delivery => delivery.kitchenOrderId);
  const deliveryFor = (orderId: string) => { const delivery = deliveries.find(candidate => candidate.kitchenOrderId === orderId); return delivery ? { fulfillment: delivery.fulfillment, deliveryOrderId: delivery.id, status: delivery.status, origin: delivery.origin, customerName: delivery.customerName.trim().split(/\s+/)[0] ?? "" } : null; };
  const counterOrders = counterOrdersFor(establishmentId).filter(order => order.status !== "DELIVERED" && order.status !== "CANCELLED").map(order => ({ ...order, items: order.items.map(item => ({ ...item, stationId: getLocalProductStation(establishmentId, item.productId), cancelledQuantity: 0, cancellations: [] as { id: string; quantity: number; reason: string; actorId: string; createdAt: string }[] })), tableId: null, tableNumber: 0, tabId: null, tabName: "", isCounter: true, delivery: deliveryFor(order.id) }));
  const orders = [...tableOrders, ...counterOrders];
  const stations = listLocalStations(establishmentId).filter(station => station.active).map(station => ({ id: station.id, name: station.name, printerDriver: station.printerDriver, printerConfig: station.printerConfig }));
  return { tables, orders, stations };
}

export function getLocalOpenTab(establishmentId: string, tabId: string) {
  const table = tablesFor(establishmentId).find(candidate => candidate.tabs.some(tab => tab.status === "OPEN" && tab.id === tabId));
  const tab = table?.tabs.find(tab => tab.status === "OPEN" && tab.id === tabId);
  return table && tab ? { table, tab } : null;
}

export function addLocalTabItem(input: { establishmentId: string; tableId: string; tabId?: string; operatorId: string; product: { id: string; name: string }; unitPrice: number; selectedOptionsSnapshot?: SelectedOptionSnapshot[] }) {
  const table = tablesFor(input.establishmentId).find(candidate => candidate.id === input.tableId && candidate.active);
  if (!table) return "TABLE_NOT_FOUND" as const;
  const open = table.tabs.filter(tab => tab.status === "OPEN");
  if ((!input.tabId && open.length > 1) || (input.tabId && !open.some(tab => tab.id === input.tabId))) return "TABLE_NOT_FOUND" as const;
  let tab = input.tabId ? open.find(tab => tab.id === input.tabId) : open[0]; let opened = false;
  if (!tab) { tab = { id: `local-tab-${randomUUID()}`, status: "OPEN", openedById: input.operatorId, openedAt: new Date().toISOString(), items: [], orders: [] }; table.tabs.push(tab); opened = true; }
  const hasOptions = Boolean(input.selectedOptionsSnapshot?.length);
  // Itens com opções escolhidas nunca são agrupados com outros — cada personalização é sua própria linha
  // na comanda, do mesmo jeito que o carrinho do PDV trata cada escolha como um cartLineId próprio.
  let item = hasOptions ? undefined : tab.items.find(candidate => candidate.productId === input.product.id && candidate.active && !candidate.selectedOptionsSnapshot?.length);
  const beforeQuantity = item?.quantity ?? 0;
  if (item) item.quantity += 1;
  else { item = { id: `local-tab-item-${randomUUID()}`, productId: input.product.id, productName: input.product.name, quantity: 1, sentQuantity: 0, unitPrice: input.unitPrice, active: true, addedById: input.operatorId, selectedOptionsSnapshot: input.selectedOptionsSnapshot?.length ? input.selectedOptionsSnapshot : undefined }; tab.items.push(item); }
  return { table, tab, item, opened, beforeQuantity };
}

export function changeLocalTabItem(input: { establishmentId: string; tabItemId: string; quantity: number }) {
  const table = tablesFor(input.establishmentId).find(candidate => candidate.tabs.some(tab => tab.status === "OPEN" && tab.items.some(item => item.id === input.tabItemId)));
  const tab = table?.tabs.find(tab => tab.status === "OPEN" && tab.items.some(item => item.id === input.tabItemId)); const item = tab?.items.find(candidate => candidate.id === input.tabItemId);
  if (!table || !tab || !item) return "ITEM_NOT_FOUND" as const;
  if (input.quantity < item.sentQuantity) return "ALREADY_SENT" as const;
  const beforeQuantity = item.quantity; item.quantity = input.quantity; item.active = input.quantity > 0;
  return { table, tab, item, beforeQuantity };
}

export function sendLocalOrder(input: { establishmentId: string; tabId: string; operatorId: string }) {
  const table = tablesFor(input.establishmentId).find(candidate => candidate.tabs.some(tab => tab.status === "OPEN" && tab.id === input.tabId)); const tab = table?.tabs.find(tab => tab.status === "OPEN" && tab.id === input.tabId);
  if (!table || !tab) return "TAB_NOT_FOUND" as const;
  const pending = tab.items.filter(item => item.active && item.quantity > item.sentQuantity).map(item => ({ tabItemId: item.id, productName: item.productName, quantity: item.quantity - item.sentQuantity }));
  if (!pending.length) return "NOTHING_TO_SEND" as const;
  const sentAt = new Date().toISOString();
  const order: LocalOrder = { id: `local-order-${randomUUID()}`, status: "RECEIVED", sentById: input.operatorId, sentAt, items: pending.map(item => { const tabItem = tab!.items.find(candidate => candidate.id === item.tabItemId); return { ...item, id: `local-order-item-${randomUUID()}`, selectedOptionsSnapshot: tabItem?.selectedOptionsSnapshot, cancellations: [] }; }), statusHistory: [{ status: "RECEIVED", actorId: input.operatorId, createdAt: sentAt }] };
  tab.orders.push(order); for (const pendingItem of pending) { const item = tab.items.find(candidate => candidate.id === pendingItem.tabItemId)!; item.sentQuantity = item.quantity; }
  return { table, tab, order };
}

export function cancelLocalSentItem(input: { establishmentId: string; tabItemId: string; quantity: number; reason: string; actorId: string }) {
  const table = tablesFor(input.establishmentId).find(candidate => candidate.tabs.some(tab => tab.status === "OPEN" && tab.items.some(item => item.id === input.tabItemId)));
  const tab = table?.tabs.find(tab => tab.status === "OPEN" && tab.items.some(item => item.id === input.tabItemId)); const item = tab?.items.find(candidate => candidate.id === input.tabItemId);
  if (!table || !tab || !item) return "ITEM_NOT_FOUND" as const;
  if (input.quantity <= 0 || input.quantity > item.sentQuantity) return "INVALID_CANCEL_QUANTITY" as const;
  let remaining = input.quantity; const affectedOrderIds = new Set<string>();
  for (const order of [...tab.orders].reverse()) {
    for (const orderItem of order.items.filter(candidate => candidate.tabItemId === item.id).reverse()) {
      const available = orderItem.quantity - orderItem.cancellations.reduce((sum, cancellation) => sum + cancellation.quantity, 0);
      const quantity = Math.min(remaining, available); if (quantity <= 0) continue;
      orderItem.cancellations.push({ id: `local-order-item-cancellation-${randomUUID()}`, quantity, reason: input.reason, actorId: input.actorId, createdAt: new Date().toISOString() });
      affectedOrderIds.add(order.id); remaining -= quantity; if (remaining === 0) break;
    }
    if (remaining === 0) break;
  }
  if (remaining > 0) return "INVALID_CANCEL_QUANTITY" as const;
  const before = { quantity: item.quantity, sentQuantity: item.sentQuantity };
  item.quantity -= input.quantity; item.sentQuantity -= input.quantity; item.active = item.quantity > 0;
  for (const order of tab.orders.filter(candidate => affectedOrderIds.has(candidate.id))) {
    if (order.items.every(orderItem => orderItem.cancellations.reduce((sum, cancellation) => sum + cancellation.quantity, 0) >= orderItem.quantity)) {
      order.status = "CANCELLED";
      order.statusHistory.push({ status: "CANCELLED", actorId: input.actorId, createdAt: new Date().toISOString() });
    }
  }
  return { table, tab, item, before, affectedOrderIds: [...affectedOrderIds] };
}

export function changeLocalOrderStatus(input: { establishmentId: string; orderId: string; status: LocalOrderStatus; actorId: string }) {
  const next: Partial<Record<LocalOrderStatus, LocalOrderStatus>> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED" };
  const table = tablesFor(input.establishmentId).find(candidate => candidate.tabs.some(tab => tab.status !== "CANCELLED" && tab.orders.some(order => order.id === input.orderId))); const tab = table?.tabs.find(tab => tab.orders.some(order => order.id === input.orderId)); const order = tab?.orders.find(candidate => candidate.id === input.orderId);
  if (table && tab && order) {
    if (next[order.status] !== input.status) return "INVALID_ORDER_TRANSITION" as const;
    const before = order.status; order.status = input.status;
    order.statusHistory.push({ status: input.status, actorId: input.actorId, createdAt: new Date().toISOString() });
    return { table, tab, order, before };
  }
  const counterOrder = counterOrdersFor(input.establishmentId).find(candidate => candidate.id === input.orderId);
  if (!counterOrder) return "ORDER_NOT_FOUND" as const;
  const delivery = listLocalDeliveryOrders(input.establishmentId).find(order => order.kitchenOrderId === input.orderId);
  const reconcile = delivery && deliveryFinished(delivery.status) && !["DELIVERED", "CANCELLED"].includes(counterOrder.status) && input.status === "DELIVERED";
  if (!reconcile && next[counterOrder.status] !== input.status) return "INVALID_ORDER_TRANSITION" as const;
  if (delivery && !deliveryFinished(delivery.status) && delivery.status !== "OUT_FOR_DELIVERY" && input.status === "DELIVERED") return "DELIVERY_HANDOFF_REQUIRED" as const;
  if (reconcile) input = { ...input, status: delivery.status === "CANCELLED" ? "CANCELLED" : "DELIVERED" };
  if (input.status === "PREPARING" || input.status === "READY") syncLocalDeliveryPreparation(input.establishmentId, input.orderId);
  const before = counterOrder.status; counterOrder.status = input.status;
  counterOrder.statusHistory.push({ status: input.status, actorId: input.actorId, createdAt: new Date().toISOString() });
  return { table: null, tab: null, order: counterOrder, before };
}

// Cancelamento do pedido de delivery (regra de negócio própria do Delivery, não do Salão) cancela o
// tíquete de cozinha correspondente direto, sem passar pela máquina de transição RECEIVED->PREPARING
// ->READY->DELIVERED de changeLocalOrderStatus (que nunca aceita CANCELLED como destino).
export function cancelLocalCounterOrder(establishmentId: string, orderId: string, actorId: string) {
  const counterOrder = counterOrdersFor(establishmentId).find(candidate => candidate.id === orderId);
  if (!counterOrder || counterOrder.status === "DELIVERED" || counterOrder.status === "CANCELLED") return;
  counterOrder.status = "CANCELLED";
  counterOrder.statusHistory.push({ status: "CANCELLED", actorId, createdAt: new Date().toISOString() });
}

// Leitura somente-leitura para os relatórios "Tempo de produção" e "Tempo por status" (ADR 0039):
// varre todas as mesas/comandas (abertas ou já fechadas — comandas pagas continuam na lista, nunca
// são removidas) e devolve, para cada pedido enviado dentro do período (`sentAt`), seu histórico de
// status normalizado. Não recebe nem devolve a fatia `data` do módulo — só objetos novos.
export function listLocalOrderTimings(establishmentId: string, from: Date, to: Date) {
  const result: { orderId: string; tableLabel: string | null; history: { status: LocalOrderStatus; at: Date }[] }[] = [];
  for (const table of tablesFor(establishmentId)) {
    for (const tab of table.tabs) {
      for (const order of tab.orders) {
        const sentAt = new Date(order.sentAt);
        if (sentAt < from || sentAt > to) continue;
        result.push({
          orderId: order.id,
          tableLabel: `Mesa ${table.number}`,
          history: order.statusHistory.map(entry => ({ status: entry.status, at: new Date(entry.createdAt) })),
        });
      }
    }
  }
  const deliveries = listLocalDeliveryOrders(establishmentId);
  for (const order of counterOrdersFor(establishmentId)) {
    const sentAt = new Date(order.sentAt);
    if (sentAt < from || sentAt > to) continue;
    const delivery = deliveries.find(candidate => candidate.kitchenOrderId === order.id);
    result.push({ orderId: order.id, tableLabel: kitchenReportLabel({ isCounter: true, tableNumber: 0, delivery: delivery ? { deliveryOrderId: delivery.id, origin: delivery.origin, fulfillment: delivery.fulfillment } : null }), history: order.statusHistory.map(entry => ({ status: entry.status, at: new Date(entry.createdAt) })) });
  }
  return result;
}

export function closeLocalTab(input: { establishmentId: string; tabId: string; saleId: string; actorId?: string }) {
  const table = tablesFor(input.establishmentId).find(candidate => candidate.tabs.some(tab => tab.status === "OPEN" && tab.id === input.tabId)); const tab = table?.tabs.find(tab => tab.status === "OPEN" && tab.id === input.tabId);
  if (!table || !tab) return "TAB_NOT_FOUND" as const;
  for (const order of tab.orders.filter(order => !["DELIVERED", "CANCELLED"].includes(order.status))) {
    order.status = "DELIVERED";
    order.statusHistory.push({ status: "DELIVERED", actorId: input.actorId ?? tab.openedById, createdAt: new Date().toISOString() });
  }
  tab.status = "PAID"; tab.closedAt = new Date().toISOString(); tab.saleId = input.saleId; return { table, tab };
}

export function getLocalCounterOrder(establishmentId: string, orderId: string | null) {
  return counterOrdersFor(establishmentId).find(order => order.id === orderId) ?? null;
}

export function syncLocalCounterOrder(establishmentId: string, orderId: string | null, status: LocalOrderStatus, actorId: string) {
  const order = getLocalCounterOrder(establishmentId, orderId);
  if (!order || order.status === status) return;
  order.status = status;
  order.statusHistory.push({ status, actorId, createdAt: new Date().toISOString() });
}

export function manageLocalNamedTab(establishmentId: string, operatorId: string, input: { action: "CREATE_TAB"; tableId: string; name: string } | { action: "RENAME_TAB"; tabId: string; name: string } | { action: "CLOSE_EMPTY_TAB"; tabId: string }) {
  const found = input.action === "CREATE_TAB" ? null : getLocalOpenTab(establishmentId, input.tabId);
  const table = input.action === "CREATE_TAB" ? tablesFor(establishmentId).find(table => table.id === input.tableId && table.active) : found?.table;
  if (!table) return "TAB_NOT_FOUND" as const;
  if (input.action !== "CLOSE_EMPTY_TAB" && table.tabs.some(tab => tab.status === "OPEN" && tab.id !== found?.tab.id && (tab.name ?? "").toLocaleLowerCase("pt-BR") === input.name.toLocaleLowerCase("pt-BR"))) return "DUPLICATE_NAME" as const;
  if (input.action === "CREATE_TAB") {
    const tab: LocalTab = { id: `local-tab-${randomUUID()}`, name: input.name, status: "OPEN", openedById: operatorId, openedAt: new Date().toISOString(), items: [], orders: [] };
    table.tabs.push(tab); return { table, tab };
  }
  if (!found) return "TAB_NOT_FOUND" as const;
  if (input.action === "RENAME_TAB") found.tab.name = input.name;
  else {
    if (found.tab.items.some(item => item.active && item.quantity > 0)) return "TAB_NOT_EMPTY" as const;
    found.tab.status = "CANCELLED"; found.tab.closedAt = new Date().toISOString();
  }
  return found;
}
