import { randomUUID } from "node:crypto";
import { getLocalProductStation, listLocalStations } from "./local-stations.ts";
import type { SelectedOptionSnapshot } from "./ingredient-options.ts";

export type LocalOrderStatus = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
type LocalTabItem = { id: string; productId: string; productName: string; quantity: number; sentQuantity: number; unitPrice: number; active: boolean; addedById: string; selectedOptionsSnapshot?: SelectedOptionSnapshot[] };
type LocalOrderItem = { id: string; tabItemId: string; productName: string; quantity: number; selectedOptionsSnapshot?: SelectedOptionSnapshot[]; cancellations: { id: string; quantity: number; reason: string; actorId: string; createdAt: string }[] };
type LocalOrder = { id: string; status: LocalOrderStatus; sentById: string; sentAt: string; items: LocalOrderItem[] };
type LocalTab = { id: string; status: "OPEN" | "PAID" | "CANCELLED"; openedById: string; openedAt: string; closedAt?: string; saleId?: string; items: LocalTabItem[]; orders: LocalOrder[] };
type LocalTable = { id: string; number: number; seats: number; name: string | null; area: string | null; assignedWaiterId: string | null; active: boolean; tabs: LocalTab[] };

const stores = new Map<string, LocalTable[]>();
const tablesFor = (establishmentId: string) => {
  if (!stores.has(establishmentId)) stores.set(establishmentId, Array.from({ length: 12 }, (_, index) => ({ id: `local-table-${establishmentId}-${index + 1}`, number: index + 1, seats: 4, name: null, area: null, assignedWaiterId: null, active: true, tabs: [] })));
  return stores.get(establishmentId)!;
};
const openTab = (table: LocalTable) => table.tabs.find(tab => tab.status === "OPEN");

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
    const tab = openTab(table);
    return { ...table, tab: tab ? { ...tab, items: tab.items.filter(item => item.active), orders: tab.orders.map(order => ({ ...order, items: order.items.map(item => { const tabItem = tab.items.find(candidate => candidate.id === item.tabItemId); const stationId = tabItem ? getLocalProductStation(establishmentId, tabItem.productId) : null; return { ...item, stationId, cancelledQuantity: item.cancellations.reduce((sum, cancellation) => sum + cancellation.quantity, 0) }; }) })) } : null };
  });
  const orders = tables.flatMap(table => table.tab?.orders.filter(order => order.status !== "DELIVERED" && order.status !== "CANCELLED").map(order => ({ ...order, tableId: table.id, tableNumber: table.number, tabId: table.tab!.id })) ?? []);
  const stations = listLocalStations(establishmentId).filter(station => station.active).map(station => ({ id: station.id, name: station.name, printerDriver: station.printerDriver, printerConfig: station.printerConfig }));
  return { tables, orders, stations };
}

export function getLocalOpenTab(establishmentId: string, tabId: string) {
  const table = tablesFor(establishmentId).find(candidate => openTab(candidate)?.id === tabId);
  const tab = table && openTab(table);
  return table && tab ? { table, tab } : null;
}

export function addLocalTabItem(input: { establishmentId: string; tableId: string; operatorId: string; product: { id: string; name: string }; unitPrice: number; selectedOptionsSnapshot?: SelectedOptionSnapshot[] }) {
  const table = tablesFor(input.establishmentId).find(candidate => candidate.id === input.tableId && candidate.active);
  if (!table) return "TABLE_NOT_FOUND" as const;
  let tab = openTab(table); let opened = false;
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
  const table = tablesFor(input.establishmentId).find(candidate => openTab(candidate)?.items.some(item => item.id === input.tabItemId));
  const tab = table && openTab(table); const item = tab?.items.find(candidate => candidate.id === input.tabItemId);
  if (!table || !tab || !item) return "ITEM_NOT_FOUND" as const;
  if (input.quantity < item.sentQuantity) return "ALREADY_SENT" as const;
  const beforeQuantity = item.quantity; item.quantity = input.quantity; item.active = input.quantity > 0;
  return { table, tab, item, beforeQuantity };
}

export function sendLocalOrder(input: { establishmentId: string; tabId: string; operatorId: string }) {
  const table = tablesFor(input.establishmentId).find(candidate => openTab(candidate)?.id === input.tabId); const tab = table && openTab(table);
  if (!table || !tab) return "TAB_NOT_FOUND" as const;
  const pending = tab.items.filter(item => item.active && item.quantity > item.sentQuantity).map(item => ({ tabItemId: item.id, productName: item.productName, quantity: item.quantity - item.sentQuantity }));
  if (!pending.length) return "NOTHING_TO_SEND" as const;
  const order: LocalOrder = { id: `local-order-${randomUUID()}`, status: "RECEIVED", sentById: input.operatorId, sentAt: new Date().toISOString(), items: pending.map(item => { const tabItem = tab!.items.find(candidate => candidate.id === item.tabItemId); return { ...item, id: `local-order-item-${randomUUID()}`, selectedOptionsSnapshot: tabItem?.selectedOptionsSnapshot, cancellations: [] }; }) };
  tab.orders.push(order); for (const pendingItem of pending) { const item = tab.items.find(candidate => candidate.id === pendingItem.tabItemId)!; item.sentQuantity = item.quantity; }
  return { table, tab, order };
}

export function cancelLocalSentItem(input: { establishmentId: string; tabItemId: string; quantity: number; reason: string; actorId: string }) {
  const table = tablesFor(input.establishmentId).find(candidate => openTab(candidate)?.items.some(item => item.id === input.tabItemId));
  const tab = table && openTab(table); const item = tab?.items.find(candidate => candidate.id === input.tabItemId);
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
    if (order.items.every(orderItem => orderItem.cancellations.reduce((sum, cancellation) => sum + cancellation.quantity, 0) >= orderItem.quantity)) order.status = "CANCELLED";
  }
  return { table, tab, item, before, affectedOrderIds: [...affectedOrderIds] };
}

export function changeLocalOrderStatus(input: { establishmentId: string; orderId: string; status: LocalOrderStatus }) {
  const table = tablesFor(input.establishmentId).find(candidate => openTab(candidate)?.orders.some(order => order.id === input.orderId)); const tab = table && openTab(table); const order = tab?.orders.find(candidate => candidate.id === input.orderId);
  if (!table || !tab || !order) return "ORDER_NOT_FOUND" as const;
  const next: Partial<Record<LocalOrderStatus, LocalOrderStatus>> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED" };
  if (next[order.status] !== input.status) return "INVALID_ORDER_TRANSITION" as const;
  const before = order.status; order.status = input.status; return { table, tab, order, before };
}

export function closeLocalTab(input: { establishmentId: string; tabId: string; saleId: string }) {
  const table = tablesFor(input.establishmentId).find(candidate => openTab(candidate)?.id === input.tabId); const tab = table && openTab(table);
  if (!table || !tab) return "TAB_NOT_FOUND" as const;
  tab.status = "PAID"; tab.closedAt = new Date().toISOString(); tab.saleId = input.saleId; return { table, tab };
}
