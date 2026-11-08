"use client";

import { deliveryFinished } from "@/lib/delivery-workflow";

import { useCallback, useEffect, useState } from "react";
import { ChefHat, ChevronLeft, CircleDollarSign, Clock3, LayoutGrid, Minus, Plus, Printer, Search, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import { money, IngredientGroup, SelectedIngredientOption } from "@/lib/domain";
import { PaymentComposer, serializeCheckout, type SaleCheckout } from "./PaymentComposer";
import { IngredientPicker, productHasIngredientChoices } from "./IngredientPicker";
import { printDanfe, printKitchenOrder, printReceipt } from "@/lib/integrations/print-client";
import type { FiscalPrintInfo } from "@/lib/fiscal/print-info";
import { ReasonSelect } from "./ReasonSelect";
import { kitchenOrderLabel, type KitchenDeliverySource } from "@/lib/kitchen-label";

type Product = { id: string; name: string; category: string; price: number; imageUrl?: string | null; ingredientGroups?: IngredientGroup[] };
type TabItem = { id: string; productId: string | null; productName: string; quantity: number; sentQuantity: number; unitPrice: number; active: boolean; selectedOptionsSnapshot?: SelectedIngredientOption[] | null };
type Order = { id: string; tabName?: string; status: "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED"; sentAt: string; items: { id?: string; productName: string; quantity: number; cancelledQuantity?: number; stationId?: string | null; selectedOptionsSnapshot?: SelectedIngredientOption[] | null }[]; tableNumber: number; tabId: string; isCounter?: boolean; delivery?: KitchenDeliverySource | null };
const orderLabel = (order: Order) => kitchenOrderLabel(order).ticket;
type Tab = { id: string; name?: string; openedAt: string; openedById: string; items: TabItem[]; orders: Order[] };
type Table = { id: string; number: number; seats: number; area?: string | null; tab: Tab | null; tabs: Tab[] };
type Station = { id: string; name: string; printerDriver: string; printerConfig: Record<string, string> };
type Snapshot = { tables: Table[]; orders: Order[]; stations: Station[] };

const statusLabels: Record<Order["status"], string> = { RECEIVED: "Recebido", PREPARING: "Em preparo", READY: "Pronto", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
const nextStatus: Partial<Record<Order["status"], Order["status"]>> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED" };

type ReceiptTemplate = { headerText: string | null; footerText: string | null; showDocument: boolean; paperWidth: number; establishmentDocument: string | null };

export function FloorManagement({ establishmentId, establishmentName, printerDriver, printTemplate, mode, canCancelSentItems, canReprint, onFinishSale, onToast }: { establishmentId: string; establishmentName: string; printerDriver: string; printTemplate?: ReceiptTemplate; mode: "salon" | "kitchen"; canCancelSentItems: boolean; canReprint: boolean; onFinishSale: (items: { id: string; quantity: number }[], checkout: SaleCheckout, table: number, tabId: string) => Promise<{ ok: boolean; fiscal: FiscalPrintInfo }>; onToast: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ tables: [], orders: [], stations: [] });
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [filter, setFilter] = useState<"Todas" | "Livres" | "Ocupadas">("Todas");
  const [checkout, setCheckout] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TabItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [floorResponse, catalogResponse] = await Promise.all([fetch("/api/operations/floor", { cache: "no-store" }), fetch("/api/operations/catalog?channel=FLOOR", { cache: "no-store" })]);
      const floor = await floorResponse.json().catch(() => ({})); const catalog = await catalogResponse.json().catch(() => ({}));
      if (!floorResponse.ok) throw new Error(floor.error ?? "Não foi possível carregar o salão.");
      if (!catalogResponse.ok) throw new Error(catalog.error ?? "Não foi possível carregar o cardápio.");
      setSnapshot(floor); setProducts(catalog.products ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o salão."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void establishmentId; void Promise.resolve().then(load); }, [establishmentId, load]);

  const mutate = async (payload: object, success: string) => {
    setSaving(true); setError("");
    try { const response = await fetch("/api/operations/floor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o salão."); setSnapshot(data); if (data.createdTabId) setSelectedTabId(data.createdTabId); onToast(success); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o salão."); return false; }
    finally { setSaving(false); }
  };

  const sendOrder = async (tabId: string, tableNumber: number) => {
    const knownOrderIds = new Set(snapshot.orders.map(order => order.id)); setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations/floor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SEND_ORDER", tabId }) }); const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível enviar o pedido."); setSnapshot(data); onToast("Pedido enviado para a cozinha");
      const order = (data.orders as Order[] | undefined)?.find(item => item.tabId === tabId && !knownOrderIds.has(item.id));
      if (order) for (const station of (data.stations as Station[] | undefined) ?? []) { const items = order.items.filter(item => item.stationId === station.id); if (station.printerDriver === "browser_print" && items.length) printKitchenOrder({ establishmentName, stationName: station.name, label: orderLabel({ ...order, tableNumber }), orderId: order.id, sentAt: order.sentAt, items: items.map(item => ({ name: item.selectedOptionsSnapshot?.length ? `${item.productName} — ${item.selectedOptionsSnapshot.map(option => option.optionName).join(", ")}` : item.productName, quantity: item.quantity })) }); }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar o pedido."); return false; } finally { setSaving(false); }
  };

  if (loading) return <div className="page-content"><div className="empty"><span>Carregando salão…</span></div></div>;
  if (mode === "kitchen") return <KitchenView establishmentId={establishmentId} establishmentName={establishmentName} orders={snapshot.orders} stations={snapshot.stations} saving={saving} error={error} canReprint={canReprint} onToast={onToast} onAdvance={async order => { const status = deliveryFinished(order.delivery?.status) ? "DELIVERED" : nextStatus[order.status]; if (status) await mutate({ action: "CHANGE_ORDER_STATUS", orderId: order.id, status }, `${orderLabel(order)}: ${statusLabels[status]}`); }} />;

  const selectedTable = snapshot.tables.find(table => table.id === selectedId);
  const selected = selectedTable ? { ...selectedTable, tab: selectedTable.tabs?.find(tab => tab.id === selectedTabId) ?? selectedTable.tab } : undefined;
  if (selected) return <CommandView key={selected.tab?.id ?? selected.id} onSelectTab={id => { setSelectedTabId(id); setCheckout(false); setCancelTarget(null); }} onManageTab={(payload) => mutate(payload, "Comanda atualizada")} table={selected} products={products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} saving={saving} error={error} checkout={checkout} setCheckout={setCheckout} canCancelSentItems={canCancelSentItems} cancelTarget={cancelTarget} setCancelTarget={setCancelTarget} onBack={() => setSelectedId(null)} onAdd={(product, optionSelections) => mutate({ action: "ADD_ITEM", tableId: selected.id, tabId: selected.tab?.id, productId: product.id, selectedOptions: optionSelections }, `${product.name} adicionado`)} onQuantity={(item, quantity) => mutate({ action: "CHANGE_ITEM", tabItemId: item.id, quantity }, quantity === 0 ? "Item removido" : "Quantidade atualizada")} onCancelSent={(item, quantity, reason) => mutate({ action: "CANCEL_SENT_ITEM", tabItemId: item.id, quantity, reason }, `${quantity} item(ns) cancelado(s)`)} onSend={() => selected.tab ? sendOrder(selected.tab.id, selected.number) : Promise.resolve(false)} onClose={async checkoutData => {
          if (!selected.tab) return false;
          const { ok, fiscal } = await onFinishSale(selected.tab.items.map(item => ({ id: item.productId ?? "", quantity: item.quantity })), checkoutData, selected.number, selected.tab.id);
          if (ok) {
            if (printerDriver === "browser_print") {
              const subtotal = selected.tab.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
              const receiptItems = selected.tab.items.map(item => ({ name: item.selectedOptionsSnapshot?.length ? `${item.productName} — ${item.selectedOptionsSnapshot.map(option => option.optionName).join(", ")}` : item.productName, quantity: item.quantity, unitPrice: item.unitPrice }));
              const total = subtotal * 1.1 - checkoutData.discount;
              const payment = checkoutData.payments.map(item => item.method).join(" + ");
              // DANFE-NFC-e no lugar do recibo comum (ADR 0049, adendo) — mesmo critério do PDV.
              if (fiscal?.printDanfe && fiscal.status === "AUTHORIZED" && fiscal.accessKey && fiscal.number && fiscal.series) {
                printDanfe({ establishmentName, items: receiptItems, total, payment, accessKey: fiscal.accessKey, number: fiscal.number, series: fiscal.series, qrCodeUrl: fiscal.qrCodeUrl, environment: fiscal.environment as "HOMOLOGACAO" | "PRODUCAO" });
              } else {
                printReceipt({ establishmentName, items: receiptItems, total, payment, channel: "FLOOR", table: selected.number, tabName: selected.tab.name }, printTemplate);
              }
            }
            await load(); setSelectedTabId(null); setCheckout(false);
          }
          return ok;
        }} />;

  const occupied = snapshot.tables.filter(table => table.tab).length;
  const visible = snapshot.tables.filter(table => filter === "Todas" || (filter === "Livres" ? !table.tab : Boolean(table.tab)));
  return <div className="page-content">{error && <div className="auth-error">{error}</div>}<div className="hero-row"><div><span className="section-kicker">Mapa operacional</span><p>Mesas e comandas sincronizadas com o histórico do sistema.</p></div><button className="primary" onClick={() => setSelectedId(snapshot.tables.find(table => !table.tab)?.id ?? snapshot.tables[0]?.id)}><Plus/> Nova comanda</button></div><div className="stats-row"><div className="stat"><div><LayoutGrid/></div><section><b>{snapshot.tables.length}</b><span>mesas no salão</span></section></div><div className="stat"><div><UtensilsCrossed/></div><section><b>{occupied}</b><span>mesas ocupadas</span></section></div><div className="stat"><div><Clock3/></div><section><b>{snapshot.orders.filter(order => order.status !== "DELIVERED").length}</b><span>pedidos em preparo</span></section></div></div><div className="section-title section-title-rich"><div><span className="room-label">Ambiente 01</span><h2>Salão principal</h2></div><div className="table-filters">{(["Todas", "Livres", "Ocupadas"] as const).map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "Todas" ? snapshot.tables.length : item === "Livres" ? snapshot.tables.length - occupied : occupied}</span></button>)}</div></div><div className="tables-grid">{visible.map(table => { const tableItems = table.tabs.flatMap(tab => tab.items); const total = tableItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0); return <button key={table.id} className={`table-card ${table.tab ? "ocupada" : "livre"}`} onClick={() => setSelectedId(table.id)}><div className="table-top"><span>Mesa</span><b>{String(table.number).padStart(2, "0")}</b><em>{table.seats} lugares</em></div>{table.area && <span className="table-area-tag">{table.area}</span>}<div className="table-icon"><UtensilsCrossed/></div><div className="table-meta"><span><i />{table.tab ? "Ocupada" : "Livre"}</span><small>{table.tab ? `${table.tabs.length} comanda(s) • ${money(total)}` : "Disponível agora"}</small></div></button>; })}</div></div>;
}

function CommandView({ onSelectTab, onManageTab, table, products, query, setQuery, category, setCategory, saving, error, checkout, setCheckout, canCancelSentItems, cancelTarget, setCancelTarget, onBack, onAdd, onQuantity, onCancelSent, onSend, onClose }: { onSelectTab: (id: string) => void; onManageTab: (payload: object) => Promise<boolean>; table: Table; products: Product[]; query: string; setQuery: (value: string) => void; category: string; setCategory: (value: string) => void; saving: boolean; error: string; checkout: boolean; setCheckout: (value: boolean) => void; canCancelSentItems: boolean; cancelTarget: TabItem | null; setCancelTarget: (item: TabItem | null) => void; onBack: () => void; onAdd: (product: Product, optionSelections?: { groupId: string; optionIds: string[] }[]) => Promise<boolean>; onQuantity: (item: TabItem, quantity: number) => Promise<boolean>; onCancelSent: (item: TabItem, quantity: number, reason: string) => Promise<boolean>; onSend: () => Promise<boolean>; onClose: (checkout: SaleCheckout) => Promise<boolean> }) {
  const categories = ["Todos", ...new Set(products.map(product => product.category))]; const visible = products.filter(product => (category === "Todos" || product.category === category) && product.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))); const items = table.tab?.items ?? []; const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0); const service = total * .1; const pending = items.some(item => item.quantity > item.sentQuantity);
  const [nameDialog, setNameDialog] = useState<"new" | "rename" | null>(null);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const addProduct = (product: Product) => { if (productHasIngredientChoices(product)) { setPickerProduct(product); return; } void onAdd(product); };
  return <div className="command-layout"><section className="catalog"><button className="back" onClick={onBack}><ChevronLeft/> Voltar ao salão</button><div className="search"><Search/><input placeholder="Buscar produto..." value={query} onChange={event => setQuery(event.target.value)}/></div><div className="chips">{categories.map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>{error && <div className="auth-error">{error}</div>}<div className="product-grid">{visible.map(product => <button className="product-card" disabled={saving} key={product.id} onClick={() => addProduct(product)}><span>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : "🌭"}</span><div><small>{product.category}</small><b>{product.name}</b><strong>{money(product.price)}</strong></div><Plus/></button>)}</div></section><aside className="ticket"><div className="named-tab-controls">
    <label className="field"><span>Comanda de quem?</span><select aria-label="Comanda por nome" value={table.tab?.id ?? ""} disabled={saving} onChange={event => onSelectTab(event.target.value)}>{!table.tabs.length && <option value="">Comanda da mesa</option>}{table.tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.name || "Comanda da mesa"} — {money(tab.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))}</option>)}</select></label>
    <div className="named-tab-actions"><button className="secondary" disabled={saving} onClick={() => setNameDialog("new")}><Plus size={16}/> Nova comanda</button>{table.tab && <button className="secondary" disabled={saving} onClick={() => setNameDialog("rename")}>Alterar nome</button>}</div>
    {table.tab && !items.length && <button className="back" disabled={saving} onClick={() => void onManageTab({ action: "CLOSE_EMPTY_TAB", tabId: table.tab!.id })}>Encerrar comanda vazia</button>}
  </div><div className="ticket-title"><div><span>COMANDA</span><h2>Mesa {String(table.number).padStart(2, "0")}</h2><strong className="tab-customer-name">{table.tab?.name || "Comanda da mesa"}</strong></div><span className="status-badge">{table.tab ? "Aberta" : "Nova"}</span></div><div className="ticket-items">{items.length === 0 ? <div className="empty"><ShoppingBag/><b>Comanda vazia</b><span>Adicione o primeiro produto para abrir a comanda.</span></div> : items.map(item => <div className="ticket-item" key={item.id}><span className="food">🌭</span><div><b>{item.productName}</b>{item.selectedOptionsSnapshot?.length ? <small className="pos-cart-options">{item.selectedOptionsSnapshot.map(option => option.optionName).join(", ")}</small> : null}<small>{money(item.unitPrice)}{item.sentQuantity > 0 ? ` · ${item.sentQuantity} enviado(s)` : ""}</small><button className="remove-tab-item" disabled={saving} onClick={() => setCancelTarget(item)} aria-label={`Retirar item: ${item.productName}`}>Retirar item</button></div><div className="stepper"><button aria-label={`Diminuir ${item.productName}`} disabled={saving} onClick={() => { if (item.quantity <= item.sentQuantity) setCancelTarget(item); else void onQuantity(item, item.quantity - 1); }}>{item.quantity === 1 ? <X/> : <Minus/>}</button><b>{item.quantity}</b><button disabled={saving} onClick={() => void onQuantity(item, item.quantity + 1)}><Plus/></button></div></div>)}</div><div className="ticket-footer"><div><span>Subtotal</span><b>{money(total)}</b></div><div><span>Serviço (10%)</span><b>{money(service)}</b></div><div className="grand"><span>Total</span><b>{money(total + service)}</b></div>{pending ? <button className="primary wide" disabled={saving} onClick={() => void onSend()}><ChefHat/> Enviar novos itens para cozinha</button> : <button className="secondary wide" disabled={!items.length || saving} onClick={() => setCheckout(true)}><CircleDollarSign/> Pagar esta comanda</button>}</div></aside>{nameDialog && <NamedTabDialog initialName={nameDialog === "rename" ? table.tab?.name ?? "" : ""} title={nameDialog === "new" ? "Nova comanda" : "Alterar nome"} saving={saving} error={error} onClose={() => setNameDialog(null)} onSave={async name => { const ok = await onManageTab(nameDialog === "new" ? { action: "CREATE_TAB", tableId: table.id, name } : { action: "RENAME_TAB", tabId: table.tab!.id, name }); if (ok) setNameDialog(null); }}/>} {checkout && <Checkout label={`Mesa ${table.number} · ${table.tab?.name || "Comanda da mesa"}`} total={total + service} onCancel={() => setCheckout(false)} onConfirm={onClose}/>} {cancelTarget && <RemoveTabItem item={items.find(item => item.id === cancelTarget.id) ?? cancelTarget} canCancelSentItems={canCancelSentItems} error={error} saving={saving} onClose={() => setCancelTarget(null)} onConfirm={async (quantity, reason, sent) => { const current = items.find(item => item.id === cancelTarget.id); if (!current) return false; const ok = sent ? await onCancelSent(current, quantity, reason) : await onQuantity(current, current.quantity - quantity); if (ok) setCancelTarget(null); return ok; }}/>} {pickerProduct && <IngredientPicker product={pickerProduct} onClose={() => setPickerProduct(null)} onConfirm={(_unitPrice, _selectedOptions, optionSelections) => { void onAdd(pickerProduct, optionSelections); setPickerProduct(null); }} />}</div>;
}

function KitchenView({ establishmentId, establishmentName, orders, stations, saving, error, canReprint, onToast, onAdvance }: { establishmentId: string; establishmentName: string; orders: Order[]; stations: Station[]; saving: boolean; error: string; canReprint: boolean; onToast: (message: string) => void; onAdvance: (order: Order) => Promise<void> }) {
  const storageKey = `mordome:kitchen-pin:${establishmentId}`;
  const [pinnedStationId, setPinnedStationId] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string>("ALL");

  useEffect(() => {
    // Estado inicial recuperado da preferência local da estação fixada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const saved = localStorage.getItem(storageKey); if (saved) { setPinnedStationId(saved); setSelectedStationId(saved); } } catch { /* tela sem acesso ao localStorage, segue sem fixar */ }
  }, [storageKey]);

  const pin = (stationId: string) => { try { localStorage.setItem(storageKey, stationId); } catch { /* tela sem acesso ao localStorage */ } setPinnedStationId(stationId); setSelectedStationId(stationId); };
  const unpin = () => { try { localStorage.removeItem(storageKey); } catch { /* tela sem acesso ao localStorage */ } setPinnedStationId(null); };

  const activeStations = stations.filter(station => pinnedStationId ? station.id === pinnedStationId : true);
  const filteredOrders = selectedStationId === "ALL" || stations.length === 0 ? orders : orders.map(order => ({ ...order, items: order.items.filter(item => item.stationId === selectedStationId) })).filter(order => order.items.length > 0);

  const reprintOrder = async (order: Order) => {
    const tickets = stations.map(station => ({ station, items: order.items.filter(item => item.stationId === station.id && item.quantity > (item.cancelledQuantity ?? 0)) })).filter(ticket => ticket.station.printerDriver === "browser_print" && ticket.items.length > 0);
    if (!tickets.length) { onToast("Nenhuma impressora pelo navegador atende este pedido"); return; }
    try {
      const response = await fetch("/api/operations/prints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType: "Order", entityId: order.id, reason: "Reimpressão da comanda de produção" }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível registrar a reimpressão.");
      for (const ticket of tickets) printKitchenOrder({ establishmentName, stationName: ticket.station.name, label: orderLabel(order), orderId: order.id, sentAt: order.sentAt, items: ticket.items.map(item => ({ name: item.selectedOptionsSnapshot?.length ? `${item.productName} — ${item.selectedOptionsSnapshot.map(option => option.optionName).join(", ")}` : item.productName, quantity: item.quantity - (item.cancelledQuantity ?? 0) })) });
      onToast("Reimpressão registrada no histórico");
    } catch (cause) { onToast(cause instanceof Error ? cause.message : "Não foi possível reimprimir."); }
  };

  return <div className="page-content">
    {error && <div className="auth-error">{error}</div>}
    <div className="hero-row"><p>Pedidos persistidos e cada mudança de etapa identificada no histórico.</p><span className="live"><i/> Sincronizado</span></div>
    {stations.length > 0 && <div className="kitchen-station-bar">
      {pinnedStationId ? <div className="kitchen-pinned"><span>Fila fixada nesta tela: <b>{activeStations[0]?.name ?? "fila removida"}</b></span><button type="button" className="secondary" onClick={unpin}>Trocar fila</button></div> : <>
        <div className="table-filters">
          <button className={selectedStationId === "ALL" ? "active" : ""} onClick={() => setSelectedStationId("ALL")}>Todas<span>{orders.length}</span></button>
          {stations.map(station => <button key={station.id} className={selectedStationId === station.id ? "active" : ""} onClick={() => setSelectedStationId(station.id)}>{station.name}<span>{orders.filter(order => order.items.some(item => item.stationId === station.id)).length}</span></button>)}
        </div>
        {selectedStationId !== "ALL" && <button type="button" className="secondary kitchen-pin-button" onClick={() => pin(selectedStationId)}>Fixar esta tela nesta fila</button>}
      </>}
    </div>}
    {canReprint && filteredOrders.length > 0 && <div className="kitchen-reprint-bar"><span>Impressão da fila</span><button type="button" className="secondary" onClick={() => void reprintOrder(filteredOrders[filteredOrders.length - 1])}><Printer/> Reimprimir pedido mais recente</button></div>}
    {filteredOrders.length === 0 ? <div className="big-empty"><ChefHat/><h2>Tudo em dia por aqui</h2><p>Novos pedidos enviados pelo salão, pelo PDV e pelo delivery aparecerão nesta tela.</p></div> : <div className="kds-grid">{filteredOrders.map(order => <article className={`kds-card ${statusLabels[order.status].replace(" ", "-").toLowerCase()}`} key={order.id}><div className="kds-head">{(() => { const label = kitchenOrderLabel(order); return <div><span>{label.kicker}</span><b>{label.title}</b>{label.detail && <small className="kds-head-detail">{label.detail}</small>}</div>; })()}<span><Clock3/> {new Date(order.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div><div className="kds-items">{order.items.map((item, index) => <div className={item.cancelledQuantity ? "cancelled" : ""} key={item.id ?? `${order.id}-${index}`}><b>{Math.max(0, item.quantity - (item.cancelledQuantity ?? 0))}×</b><span>{item.productName}{item.selectedOptionsSnapshot?.length ? <small className="kds-item-options">{item.selectedOptionsSnapshot.map(option => option.optionName).join(", ")}</small> : null}{item.cancelledQuantity ? <small>{item.cancelledQuantity} cancelado(s)</small> : null}</span></div>)}</div><div className="kds-foot"><span>{statusLabels[order.status]}</span>{nextStatus[order.status] && <button disabled={saving || Boolean(order.delivery && order.status === "READY" && !deliveryFinished(order.delivery.status) && order.delivery.status !== "OUT_FOR_DELIVERY")} onClick={() => void onAdvance(order)}>{deliveryFinished(order.delivery?.status) ? "Encerrar na cozinha" : order.delivery && order.status === "READY" ? "Aguardando saída no delivery" : order.status === "READY" ? "Entregar" : order.status === "PREPARING" ? "Marcar pronto" : "Iniciar preparo"}</button>}</div></article>)}</div>}
  </div>;
}

function RemoveTabItem({ item, canCancelSentItems, error, saving, onClose, onConfirm }: { item: TabItem; canCancelSentItems: boolean; error: string; saving: boolean; onClose: () => void; onConfirm: (quantity: number, reason: string, sent: boolean) => Promise<boolean> }) {
  const pending = Math.max(0, item.quantity - item.sentQuantity);
  const [sent, setSent] = useState(pending === 0);
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const maximum = sent ? item.sentQuantity : pending;
  const amount = Number(quantity);
  const allowed = !sent || canCancelSentItems;
  const valid = Number.isInteger(amount) && amount > 0 && amount <= maximum && allowed && (!sent || reason.trim().length >= 3);
  return <div className="modal-bg"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="remove-item-title">
    <button className="modal-close" aria-label="Voltar à comanda" disabled={saving} onClick={onClose}><X/></button>
    <span className="modal-icon cancel"><X/></span><h2 id="remove-item-title">Retirar item</h2><p><strong>{item.productName}</strong></p>
    {pending > 0 && item.sentQuantity > 0 && <label className="field"><span>Quais unidades retirar?</span><select disabled={saving} value={sent ? "sent" : "pending"} onChange={event => { setSent(event.target.value === "sent"); setQuantity("1"); }}><option value="pending">Ainda não enviadas ({pending})</option><option value="sent">Já enviadas à cozinha ({item.sentQuantity})</option></select></label>}
    <p>{sent ? "A quantidade será descontada desta comanda e atualizada na tela da cozinha, mantendo o histórico." : "A quantidade será retirada desta comanda antes do envio à cozinha."}</p>
    {sent && <p>Se o pedido já foi impresso, avise a cozinha sobre o cancelamento.</p>}
    {!allowed && <p role="alert">Seu perfil não permite cancelar itens enviados. Peça a um responsável com permissão de cancelamento.</p>}
    <label className="field"><span>Quantidade a retirar (máximo {maximum})</span><input type="number" min={1} max={maximum} step={1} value={quantity} disabled={saving || !allowed} onChange={event => setQuantity(event.target.value)}/></label>
    {sent && allowed && <ReasonSelect category="ITEM_CANCEL" value={reason} onChange={setReason} placeholder="Ex.: cliente desistiu do item"/>}
    {error && <p role="alert" className="error">{error}</p>}
    <button className="primary wide" disabled={saving || !valid} onClick={() => void onConfirm(amount, reason.trim(), sent)}>{saving ? "Retirando…" : `Retirar ${valid ? amount : ""} item(ns)`}</button>
  </div></div>;
}

function Checkout({ label, total, onCancel, onConfirm }: { label: string; total: number; onCancel: () => void; onConfirm: (checkout: SaleCheckout) => Promise<boolean> }) { const [payments, setPayments] = useState([{ method: "Pix", amount: total.toFixed(2), receivedAmount: "" }]); const [discount, setDiscount] = useState(""); const [discountReason, setDiscountReason] = useState(""); const [loading, setLoading] = useState(false); return <div className="modal-bg"><div className="modal payment-modal"><button className="modal-close" onClick={onCancel}><X/></button><span className="modal-icon"><CircleDollarSign/></span><h2>Pagar comanda</h2><p><strong>{label}</strong></p><p>Este pagamento fecha apenas esta comanda.</p><PaymentComposer grossTotal={total} discount={discount} setDiscount={setDiscount} discountReason={discountReason} setDiscountReason={setDiscountReason} payments={payments} setPayments={setPayments}/><button className="primary wide" disabled={loading} onClick={async () => { setLoading(true); await onConfirm(serializeCheckout(payments, discount, discountReason, total)); setLoading(false); }}>{loading ? "Finalizando…" : "Confirmar pagamento"}</button></div></div>; }

function NamedTabDialog({ initialName, title, saving, error, onClose, onSave }: { initialName: string; title: string; saving: boolean; error: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initialName);
  return <div className="modal-bg"><form className="modal" onSubmit={event => { event.preventDefault(); if (name.trim() && !saving) void onSave(name.trim()); }}><button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Fechar"><X/></button><h2>{title}</h2><p>Use o nome da pessoa ou do grupo que vai pagar esta conta.</p><label className="field"><span>Nome da comanda</span><input autoFocus maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Ana, Carlos, Família Silva" required /></label>{error && <p className="auth-error">{error}</p>}<button className="primary wide" type="submit" disabled={saving || !name.trim()}>{saving ? "Salvando…" : "Salvar comanda"}</button></form></div>;
}
