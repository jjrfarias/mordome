"use client";

import { useCallback, useEffect, useState } from "react";
import { ChefHat, ChevronLeft, CircleDollarSign, Clock3, LayoutGrid, Minus, Plus, Printer, Search, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import { money } from "@/lib/domain";
import { PaymentComposer, serializeCheckout, type SaleCheckout } from "./PaymentComposer";
import { printKitchenOrder, printReceipt } from "@/lib/integrations/print-client";

type Product = { id: string; name: string; category: string; price: number };
type TabItem = { id: string; productId: string | null; productName: string; quantity: number; sentQuantity: number; unitPrice: number; active: boolean };
type Order = { id: string; status: "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED"; sentAt: string; items: { id?: string; productName: string; quantity: number; cancelledQuantity?: number; stationId?: string | null }[]; tableNumber: number; tabId: string };
type Tab = { id: string; openedAt: string; openedById: string; items: TabItem[]; orders: Order[] };
type Table = { id: string; number: number; seats: number; area?: string | null; tab: Tab | null };
type Station = { id: string; name: string; printerDriver: string; printerConfig: Record<string, string> };
type Snapshot = { tables: Table[]; orders: Order[]; stations: Station[] };

const statusLabels: Record<Order["status"], string> = { RECEIVED: "Recebido", PREPARING: "Em preparo", READY: "Pronto", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
const nextStatus: Partial<Record<Order["status"], Order["status"]>> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED" };

export function FloorManagement({ establishmentId, establishmentName, printerDriver, mode, canCancelSentItems, canReprint, onFinishSale, onToast }: { establishmentId: string; establishmentName: string; printerDriver: string; mode: "salon" | "kitchen"; canCancelSentItems: boolean; canReprint: boolean; onFinishSale: (items: { id: string; quantity: number }[], checkout: SaleCheckout, table: number, tabId: string) => Promise<boolean>; onToast: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ tables: [], orders: [], stations: [] });
  const [products, setProducts] = useState<Product[]>([]);
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
    try { const response = await fetch("/api/operations/floor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o salão."); setSnapshot(data); onToast(success); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o salão."); return false; }
    finally { setSaving(false); }
  };

  const sendOrder = async (tabId: string, tableNumber: number) => {
    const knownOrderIds = new Set(snapshot.orders.map(order => order.id)); setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations/floor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SEND_ORDER", tabId }) }); const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível enviar o pedido."); setSnapshot(data); onToast("Pedido enviado para a cozinha");
      const order = (data.orders as Order[] | undefined)?.find(item => !knownOrderIds.has(item.id));
      if (order) for (const station of (data.stations as Station[] | undefined) ?? []) { const items = order.items.filter(item => item.stationId === station.id); if (station.printerDriver === "browser_print" && items.length) printKitchenOrder({ establishmentName, stationName: station.name, table: tableNumber, orderId: order.id, sentAt: order.sentAt, items: items.map(item => ({ name: item.productName, quantity: item.quantity })) }); }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar o pedido."); return false; } finally { setSaving(false); }
  };

  if (loading) return <div className="page-content"><div className="empty"><span>Carregando salão…</span></div></div>;
  if (mode === "kitchen") return <KitchenView establishmentId={establishmentId} establishmentName={establishmentName} orders={snapshot.orders} stations={snapshot.stations} saving={saving} error={error} canReprint={canReprint} onToast={onToast} onAdvance={async order => { const status = nextStatus[order.status]; if (status) await mutate({ action: "CHANGE_ORDER_STATUS", orderId: order.id, status }, `Mesa ${order.tableNumber}: ${statusLabels[status]}`); }} />;

  const selected = snapshot.tables.find(table => table.id === selectedId);
  if (selected) return <CommandView table={selected} products={products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} saving={saving} error={error} checkout={checkout} setCheckout={setCheckout} canCancelSentItems={canCancelSentItems} cancelTarget={cancelTarget} setCancelTarget={setCancelTarget} onBack={() => setSelectedId(null)} onAdd={product => mutate({ action: "ADD_ITEM", tableId: selected.id, productId: product.id }, `${product.name} adicionado`)} onQuantity={(item, quantity) => mutate({ action: "CHANGE_ITEM", tabItemId: item.id, quantity }, quantity === 0 ? "Item removido" : "Quantidade atualizada")} onCancelSent={(item, quantity, reason) => mutate({ action: "CANCEL_SENT_ITEM", tabItemId: item.id, quantity, reason }, `${quantity} item(ns) cancelado(s)`)} onSend={() => selected.tab ? sendOrder(selected.tab.id, selected.number) : Promise.resolve(false)} onClose={async checkoutData => { if (!selected.tab) return false; const completed = await onFinishSale(selected.tab.items.map(item => ({ id: item.productId ?? "", quantity: item.quantity })), checkoutData, selected.number, selected.tab.id); if (completed) { if (printerDriver === "browser_print") { const subtotal = selected.tab.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0); printReceipt({ establishmentName, items: selected.tab.items.map(item => ({ name: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })), total: subtotal * 1.1 - checkoutData.discount, payment: checkoutData.payments.map(item => item.method).join(" + "), channel: "FLOOR", table: selected.number }); } await load(); setSelectedId(null); setCheckout(false); } return completed; }} />;

  const occupied = snapshot.tables.filter(table => table.tab).length;
  const visible = snapshot.tables.filter(table => filter === "Todas" || (filter === "Livres" ? !table.tab : Boolean(table.tab)));
  return <div className="page-content">{error && <div className="auth-error">{error}</div>}<div className="hero-row"><div><span className="section-kicker">Mapa operacional</span><p>Mesas e comandas sincronizadas com o histórico do sistema.</p></div><button className="primary" onClick={() => setSelectedId(snapshot.tables.find(table => !table.tab)?.id ?? snapshot.tables[0]?.id)}><Plus/> Nova comanda</button></div><div className="stats-row"><div className="stat"><div><LayoutGrid/></div><section><b>{snapshot.tables.length}</b><span>mesas no salão</span></section></div><div className="stat"><div><UtensilsCrossed/></div><section><b>{occupied}</b><span>mesas ocupadas</span></section></div><div className="stat"><div><Clock3/></div><section><b>{snapshot.orders.filter(order => order.status !== "DELIVERED").length}</b><span>pedidos em preparo</span></section></div></div><div className="section-title section-title-rich"><div><span className="room-label">Ambiente 01</span><h2>Salão principal</h2></div><div className="table-filters">{(["Todas", "Livres", "Ocupadas"] as const).map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "Todas" ? snapshot.tables.length : item === "Livres" ? snapshot.tables.length - occupied : occupied}</span></button>)}</div></div><div className="tables-grid">{visible.map(table => { const total = table.tab?.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) ?? 0; return <button key={table.id} className={`table-card ${table.tab ? "ocupada" : "livre"}`} onClick={() => setSelectedId(table.id)}><div className="table-top"><span>Mesa</span><b>{String(table.number).padStart(2, "0")}</b><em>{table.seats} lugares</em></div>{table.area && <span className="table-area-tag">{table.area}</span>}<div className="table-icon"><UtensilsCrossed/></div><div className="table-meta"><span><i />{table.tab ? "Ocupada" : "Livre"}</span><small>{table.tab ? `${table.tab.items.reduce((sum, item) => sum + item.quantity, 0)} itens • ${money(total)}` : "Disponível agora"}</small></div></button>; })}</div></div>;
}

function CommandView({ table, products, query, setQuery, category, setCategory, saving, error, checkout, setCheckout, canCancelSentItems, cancelTarget, setCancelTarget, onBack, onAdd, onQuantity, onCancelSent, onSend, onClose }: { table: Table; products: Product[]; query: string; setQuery: (value: string) => void; category: string; setCategory: (value: string) => void; saving: boolean; error: string; checkout: boolean; setCheckout: (value: boolean) => void; canCancelSentItems: boolean; cancelTarget: TabItem | null; setCancelTarget: (item: TabItem | null) => void; onBack: () => void; onAdd: (product: Product) => Promise<boolean>; onQuantity: (item: TabItem, quantity: number) => Promise<boolean>; onCancelSent: (item: TabItem, quantity: number, reason: string) => Promise<boolean>; onSend: () => Promise<boolean>; onClose: (checkout: SaleCheckout) => Promise<boolean> }) {
  const categories = ["Todos", ...new Set(products.map(product => product.category))]; const visible = products.filter(product => (category === "Todos" || product.category === category) && product.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))); const items = table.tab?.items ?? []; const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0); const service = total * .1; const pending = items.some(item => item.quantity > item.sentQuantity);
  return <div className="command-layout"><section className="catalog"><button className="back" onClick={onBack}><ChevronLeft/> Voltar ao salão</button><div className="search"><Search/><input placeholder="Buscar produto..." value={query} onChange={event => setQuery(event.target.value)}/></div><div className="chips">{categories.map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>{error && <div className="auth-error">{error}</div>}<div className="product-grid">{visible.map(product => <button className="product-card" disabled={saving} key={product.id} onClick={() => void onAdd(product)}><span>🌭</span><div><small>{product.category}</small><b>{product.name}</b><strong>{money(product.price)}</strong></div><Plus/></button>)}</div></section><aside className="ticket"><div className="ticket-title"><div><span>COMANDA</span><h2>Mesa {String(table.number).padStart(2, "0")}</h2></div><span className="status-badge">{table.tab ? "Aberta" : "Nova"}</span></div><div className="ticket-items">{items.length === 0 ? <div className="empty"><ShoppingBag/><b>Comanda vazia</b><span>Adicione o primeiro produto para abrir a comanda.</span></div> : items.map(item => <div className="ticket-item" key={item.id}><span className="food">🌭</span><div><b>{item.productName}</b><small>{money(item.unitPrice)}{item.sentQuantity > 0 ? ` · ${item.sentQuantity} enviado(s)` : ""}</small>{canCancelSentItems && item.sentQuantity > 0 && <button className="cancel-sent-item" disabled={saving} onClick={() => setCancelTarget(item)}>Cancelar enviado</button>}</div><div className="stepper"><button disabled={saving || item.quantity <= item.sentQuantity} onClick={() => void onQuantity(item, item.quantity - 1)}>{item.quantity === 1 ? <X/> : <Minus/>}</button><b>{item.quantity}</b><button disabled={saving} onClick={() => void onQuantity(item, item.quantity + 1)}><Plus/></button></div></div>)}</div><div className="ticket-footer"><div><span>Subtotal</span><b>{money(total)}</b></div><div><span>Serviço (10%)</span><b>{money(service)}</b></div><div className="grand"><span>Total</span><b>{money(total + service)}</b></div>{pending ? <button className="primary wide" disabled={saving} onClick={() => void onSend()}><ChefHat/> Enviar para cozinha</button> : <button className="secondary wide" disabled={!items.length || saving} onClick={() => setCheckout(true)}><CircleDollarSign/> Fechar conta</button>}</div></aside>{checkout && <Checkout total={total + service} onCancel={() => setCheckout(false)} onConfirm={onClose}/>} {cancelTarget && <CancelSentItem item={cancelTarget} saving={saving} onClose={() => setCancelTarget(null)} onConfirm={async (quantity, reason) => { const ok = await onCancelSent(cancelTarget, quantity, reason); if (ok) setCancelTarget(null); return ok; }}/>}</div>;
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
      for (const ticket of tickets) printKitchenOrder({ establishmentName, stationName: ticket.station.name, table: order.tableNumber, orderId: order.id, sentAt: order.sentAt, items: ticket.items.map(item => ({ name: item.productName, quantity: item.quantity - (item.cancelledQuantity ?? 0) })) });
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
    {filteredOrders.length === 0 ? <div className="big-empty"><ChefHat/><h2>Tudo em dia por aqui</h2><p>Novos pedidos enviados pelo salão aparecerão nesta tela.</p></div> : <div className="kds-grid">{filteredOrders.map(order => <article className={`kds-card ${statusLabels[order.status].replace(" ", "-").toLowerCase()}`} key={order.id}><div className="kds-head"><div><span>MESA</span><b>{String(order.tableNumber).padStart(2, "0")}</b></div><span><Clock3/> {new Date(order.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div><div className="kds-items">{order.items.map((item, index) => <div className={item.cancelledQuantity ? "cancelled" : ""} key={item.id ?? `${order.id}-${index}`}><b>{Math.max(0, item.quantity - (item.cancelledQuantity ?? 0))}×</b><span>{item.productName}{item.cancelledQuantity ? <small>{item.cancelledQuantity} cancelado(s)</small> : null}</span></div>)}</div><div className="kds-foot"><span>{statusLabels[order.status]}</span>{nextStatus[order.status] && <button disabled={saving} onClick={() => void onAdvance(order)}>{order.status === "READY" ? "Entregar" : order.status === "PREPARING" ? "Marcar pronto" : "Iniciar preparo"}</button>}</div></article>)}</div>}
  </div>;
}

function CancelSentItem({ item, saving, onClose, onConfirm }: { item: TabItem; saving: boolean; onClose: () => void; onConfirm: (quantity: number, reason: string) => Promise<boolean> }) {
  const [quantity, setQuantity] = useState(1); const [reason, setReason] = useState("");
  return <div className="modal-bg"><div className="modal"><button className="modal-close" onClick={onClose}><X/></button><span className="modal-icon cancel"><X/></span><h2>Cancelar item enviado</h2><p>A cozinha será avisada e a quantidade sairá da comanda. O registro continuará no histórico.</p><label>Quantidade<input type="number" min={1} max={item.sentQuantity} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(item.sentQuantity, Number(event.target.value))))}/></label><label>Motivo obrigatório<input value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={200} placeholder="Ex.: cliente desistiu do item"/></label><button className="primary wide" disabled={saving || reason.trim().length < 3} onClick={() => void onConfirm(quantity, reason.trim())}>{saving ? "Cancelando…" : `Cancelar ${quantity} ${item.productName}`}</button></div></div>;
}

function Checkout({ total, onCancel, onConfirm }: { total: number; onCancel: () => void; onConfirm: (checkout: SaleCheckout) => Promise<boolean> }) { const [payments, setPayments] = useState([{ method: "Pix", amount: total.toFixed(2), receivedAmount: "" }]); const [discount, setDiscount] = useState(""); const [discountReason, setDiscountReason] = useState(""); const [loading, setLoading] = useState(false); return <div className="modal-bg"><div className="modal payment-modal"><button className="modal-close" onClick={onCancel}><X/></button><span className="modal-icon"><CircleDollarSign/></span><h2>Fechar conta</h2><p>Confira desconto, recebimentos e eventual troco.</p><PaymentComposer grossTotal={total} discount={discount} setDiscount={setDiscount} discountReason={discountReason} setDiscountReason={setDiscountReason} payments={payments} setPayments={setPayments}/><button className="primary wide" disabled={loading} onClick={async () => { setLoading(true); await onConfirm(serializeCheckout(payments, discount, discountReason, total)); setLoading(false); }}>{loading ? "Finalizando…" : "Confirmar pagamento"}</button></div></div>; }
