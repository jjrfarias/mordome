"use client";

import { useLiveRefresh } from "./useLiveRefresh";
import { OrderTableDialog } from "./OrderTableDialog";
import { DeliveryAddition } from "./DeliveryAddition";
import { kitchenReady } from "@/lib/delivery-workflow";
import { requiresDelivery } from "@/lib/order-fulfillment";

import { deliveryFinished } from "@/lib/delivery-workflow";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChefHat, ChevronLeft, CircleDollarSign, Clock3, LayoutGrid, Minus, Plus, Printer, Search, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import { money, IngredientGroup, SelectedIngredientOption } from "@/lib/domain";
import { PaymentComposer, serializeCheckout, type SaleCheckout } from "./PaymentComposer";
import { IngredientPicker } from "./IngredientPicker";
import { printDanfe, printKitchenOrder, printReceipt } from "@/lib/integrations/print-client";
import type { FiscalPrintInfo } from "@/lib/fiscal/print-info";
import { ReasonSelect } from "./ReasonSelect";
import { kitchenOrderLabel, type KitchenDeliverySource } from "@/lib/kitchen-label";

type Product = { id: string; name: string; category: string; price: number; imageUrl?: string | null; ingredientGroups?: IngredientGroup[] };
type TabItem = { id: string; productId: string | null; productName: string; quantity: number; sentQuantity: number; unitPrice: number; active: boolean; notes?: string | null; selectedOptionsSnapshot?: SelectedIngredientOption[] | null };
type Order = { id: string; tabName?: string; status: "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED"; sentAt: string; items: { id?: string; productName: string; quantity: number; cancelledQuantity?: number; stationId?: string | null; notes?: string | null; selectedOptionsSnapshot?: SelectedIngredientOption[] | null }[]; tableNumber: number; tabId: string; isCounter?: boolean; delivery?: KitchenDeliverySource | null };
const orderLabel = (order: Order) => kitchenOrderLabel(order).ticket;
type Tab = { linkedOrder?: { id: string; customerName: string } | null; id: string; name?: string; openedAt: string; openedById: string; items: TabItem[]; orders: Order[] };
type Table = { id: string; number: number; seats: number; area?: string | null; tab: Tab | null; tabs: Tab[] };
type Station = { id: string; name: string; printerDriver: string; printerConfig: Record<string, string> };
type Snapshot = { serviceRate?: number; tables: Table[]; orders: Order[]; stations: Station[] };

const statusLabels: Record<Order["status"], string> = { RECEIVED: "Recebido", PREPARING: "Em preparo", READY: "Pronto", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
const nextStatus: Partial<Record<Order["status"], Order["status"]>> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED" };

type ReceiptTemplate = { headerText: string | null; footerText: string | null; showDocument: boolean; paperWidth: number; establishmentDocument: string | null };

export function FloorManagement({ establishmentId, establishmentName, printerDriver, printTemplate, mode, canCancelSentItems, canReprint, onFinishSale, onToast }: { establishmentId: string; establishmentName: string; printerDriver: string; printTemplate?: ReceiptTemplate; mode: "salon" | "kitchen"; canCancelSentItems: boolean; canReprint: boolean; onFinishSale: (items: { id: string; quantity: number }[], checkout: SaleCheckout, table: number, tabId: string) => Promise<{ ok: boolean; fiscal: FiscalPrintInfo; automaticReceipt?: boolean }>; onToast: (message: string) => void }) {
  const requestVersion = useRef(0);
  const [syncError, setSyncError] = useState("");
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
  const [linking, setLinking] = useState(false);
  const [checkoutTabId, setCheckoutTabId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TabItem | null>(null);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const [floorResponse, catalogResponse] = await Promise.all([fetch("/api/operations/floor", { cache: "no-store" }), fetch("/api/operations/catalog?channel=FLOOR", { cache: "no-store" })]);
      const floor = await floorResponse.json().catch(() => ({})); const catalog = await catalogResponse.json().catch(() => ({}));
      if (!floorResponse.ok) throw new Error(floor.error ?? "Não foi possível carregar o salão.");
      if (!catalogResponse.ok) throw new Error(catalog.error ?? "Não foi possível carregar o cardápio.");
      if (version !== requestVersion.current) return;
      setSnapshot(floor); setProducts(catalog.products ?? []); setSyncError("");
    } catch (cause) { if (version === requestVersion.current) setSyncError(cause instanceof Error ? cause.message : "Não foi possível carregar o salão."); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, []);
  useEffect(() => () => { requestVersion.current++; }, [establishmentId]);
  useLiveRefresh(load, establishmentId, !saving);

  const mutate = async (payload: object, success: string) => {
    requestVersion.current++; setSaving(true); setError("");
    try { const response = await fetch("/api/operations/floor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o salão."); setSnapshot(current => ({ ...data, serviceRate: data.serviceRate ?? current.serviceRate })); if (data.createdTabId) setSelectedTabId(data.createdTabId); onToast(success); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o salão."); return false; }
    finally { setSaving(false); }
  };

  const sendOrder = async (tabId: string, tableNumber: number, printKitchen: boolean) => {
    const knownOrderIds = new Set(snapshot.orders.map(order => order.id)); requestVersion.current++; setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations/floor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SEND_ORDER", tabId, printKitchen }) }); const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível enviar o pedido."); setSnapshot(current => ({ ...data, serviceRate: data.serviceRate ?? current.serviceRate })); onToast("Pedido enviado para a cozinha");
      const order = (data.orders as Order[] | undefined)?.find(item => item.tabId === tabId && !knownOrderIds.has(item.id));
      if (order && printKitchen) for (const station of (data.stations as Station[] | undefined) ?? []) { const items = order.items.filter(item => item.stationId === station.id); if (station.printerDriver === "browser_print" && items.length) printKitchenOrder({ establishmentName, stationName: station.name, label: orderLabel({ ...order, tableNumber }), orderId: order.id, sentAt: order.sentAt, items: items.map(item => ({ name: [item.productName, ...(item.selectedOptionsSnapshot ?? []).map(option => option.optionName), ...(item.notes ? [`OBS: ${item.notes}`] : [])].join(" — "), quantity: item.quantity })) }); }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar o pedido."); return false; } finally { setSaving(false); }
  };

  if (loading) return <div className="page-content"><div className="empty"><span>Carregando salão…</span></div></div>;
  if (mode === "kitchen") return <KitchenView establishmentId={establishmentId} establishmentName={establishmentName} orders={snapshot.orders} stations={snapshot.stations} saving={saving} error={error || syncError} canReprint={canReprint} onToast={onToast} onAdvance={async order => { const status = deliveryFinished(order.delivery?.status) ? "DELIVERED" : nextStatus[order.status]; if (status) await mutate({ action: "CHANGE_ORDER_STATUS", orderId: order.id, status }, `${orderLabel(order)}: ${statusLabels[status]}`); }} />;

  const selectedTable = snapshot.tables.find(table => table.id === selectedId);
  const selected = selectedTable ? { ...selectedTable, tab: selectedTable.tabs?.find(tab => tab.id === selectedTabId) ?? selectedTable.tab } : undefined;
  const checkout = Boolean(checkoutTabId && checkoutTabId === selected?.tab?.id);
  const setCheckout = (open: boolean) => setCheckoutTabId(open ? selected?.tab?.id ?? null : null);
  if (selected?.tab?.linkedOrder) return <LinkedCommand key={selected.tab.id} error={error || syncError} onSelectTab={setSelectedTabId} table={selected} tab={selected.tab} products={products} serviceRate={snapshot.serviceRate ?? 10} onBack={() => setSelectedId(null)} onReload={load} onClose={async checkoutData => {
    const result = await onFinishSale(selected.tab!.items.map(item => ({ id: item.productId ?? "", quantity: item.quantity })), checkoutData, selected.number, selected.tab!.id);
    if (result.ok) { await load(); setSelectedId(null); onToast("Comanda paga e concluída"); }
    return result.ok;
  }}/>;
  if (selected) return <CommandView serviceRate={snapshot.serviceRate ?? 10} key={selected.tab?.id ?? selected.id} onSelectTab={id => { setSelectedTabId(id); setCheckout(false); setCancelTarget(null); }} onManageTab={(payload) => mutate(payload, "Comanda atualizada")} table={selected} products={products} query={query} setQuery={setQuery} category={category} setCategory={setCategory} saving={saving} error={error || syncError} checkout={checkout} setCheckout={setCheckout} canCancelSentItems={canCancelSentItems} cancelTarget={cancelTarget} setCancelTarget={setCancelTarget} onBack={() => setSelectedId(null)} onAdd={(product, optionSelections, notes) => mutate({ action: "ADD_ITEM", tableId: selected.id, tabId: selected.tab?.id, productId: product.id, selectedOptions: optionSelections, notes }, `${product.name} adicionado`)} onQuantity={(item, quantity) => mutate({ action: "CHANGE_ITEM", tabItemId: item.id, quantity }, quantity === 0 ? "Item removido" : "Quantidade atualizada")} onCancelSent={(item, quantity, reason) => mutate({ action: "CANCEL_SENT_ITEM", tabItemId: item.id, quantity, reason }, `${quantity} item(ns) cancelado(s)`)} onSend={(printKitchen) => selected.tab ? sendOrder(selected.tab.id, selected.number, printKitchen) : Promise.resolve(false)} onClose={async checkoutData => {
          if (!selected.tab) return false;
          const { ok, fiscal, automaticReceipt } = await onFinishSale(selected.tab.items.map(item => ({ id: item.productId ?? "", quantity: item.quantity })), checkoutData, selected.number, selected.tab.id);
          if (ok) {
            if (checkoutData.printReceipt !== false && printerDriver === "browser_print" && (!automaticReceipt || (fiscal?.printDanfe && fiscal.status === "AUTHORIZED"))) {
              const subtotal = selected.tab.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
              const receiptItems = selected.tab.items.map(item => ({ name: [item.productName, ...(item.selectedOptionsSnapshot ?? []).map(option => option.optionName), ...(item.notes ? [`OBS: ${item.notes}`] : [])].join(" — "), quantity: item.quantity, unitPrice: item.unitPrice }));
              const total = subtotal + (checkoutData.waiveService ? 0 : Math.round(subtotal * (snapshot.serviceRate ?? 10)) / 100) - checkoutData.discount;
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
  return <div className="page-content">{linking && <OrderTableDialog tables={snapshot.tables} onClose={() => setLinking(false)} onLinked={async (tableId, tabId) => { setLinking(false); await load(); setSelectedId(tableId); setSelectedTabId(tabId); onToast("Pedido vinculado à mesa sem reenviar a produção"); }}/>} {(error || syncError) && <div className="auth-error">{error || syncError}</div>}<div className="hero-row"><button className="secondary" onClick={() => setLinking(true)}>Vincular pedido à mesa</button><div><span className="section-kicker">Mapa operacional</span><p>Mesas e comandas sincronizadas com o histórico do sistema.</p></div><button className="primary" onClick={() => setSelectedId(snapshot.tables.find(table => !table.tab)?.id ?? snapshot.tables[0]?.id)}><Plus/> Nova comanda</button></div><div className="stats-row"><div className="stat"><div><LayoutGrid/></div><section><b>{snapshot.tables.length}</b><span>mesas no salão</span></section></div><div className="stat"><div><UtensilsCrossed/></div><section><b>{occupied}</b><span>mesas ocupadas</span></section></div><div className="stat"><div><Clock3/></div><section><b>{snapshot.orders.filter(order => order.status !== "DELIVERED").length}</b><span>pedidos em preparo</span></section></div></div><div className="section-title section-title-rich"><div><span className="room-label">Ambiente 01</span><h2>Salão principal</h2></div><div className="table-filters">{(["Todas", "Livres", "Ocupadas"] as const).map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "Todas" ? snapshot.tables.length : item === "Livres" ? snapshot.tables.length - occupied : occupied}</span></button>)}</div></div><div className="tables-grid">{visible.map(table => { const tableItems = table.tabs.flatMap(tab => tab.items); const total = tableItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0); return <button key={table.id} className={`table-card ${table.tab ? "ocupada" : "livre"}`} onClick={() => setSelectedId(table.id)}><div className="table-top"><span>Mesa</span><b>{String(table.number).padStart(2, "0")}</b><em>{table.seats} lugares</em></div>{table.area && <span className="table-area-tag">{table.area}</span>}<div className="table-icon"><UtensilsCrossed/></div><div className="table-meta"><span><i />{table.tab ? "Ocupada" : "Livre"}</span><small>{table.tab ? `${table.tabs.length} comanda(s) • ${money(total)}` : "Disponível agora"}</small></div></button>; })}</div></div>;
}

function CommandView({ serviceRate, onSelectTab, onManageTab, table, products, query, setQuery, category, setCategory, saving, error, checkout, setCheckout, canCancelSentItems, cancelTarget, setCancelTarget, onBack, onAdd, onQuantity, onCancelSent, onSend, onClose }: { serviceRate: number; onSelectTab: (id: string) => void; onManageTab: (payload: object) => Promise<boolean>; table: Table; products: Product[]; query: string; setQuery: (value: string) => void; category: string; setCategory: (value: string) => void; saving: boolean; error: string; checkout: boolean; setCheckout: (value: boolean) => void; canCancelSentItems: boolean; cancelTarget: TabItem | null; setCancelTarget: (item: TabItem | null) => void; onBack: () => void; onAdd: (product: Product, optionSelections?: { groupId: string; optionIds: string[] }[], notes?: string) => Promise<boolean>; onQuantity: (item: TabItem, quantity: number) => Promise<boolean>; onCancelSent: (item: TabItem, quantity: number, reason: string) => Promise<boolean>; onSend: (printKitchen: boolean) => Promise<boolean>; onClose: (checkout: SaleCheckout) => Promise<boolean> }) {
  const categories = ["Todos", ...new Set(products.map(product => product.category))]; const visible = products.filter(product => (category === "Todos" || product.category === category) && [product.name, product.category].some(value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")))); const items = table.tab?.items ?? []; const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0); const service = Math.round(total * serviceRate) / 100; const pending = items.some(item => item.quantity > item.sentQuantity);
  const [nameDialog, setNameDialog] = useState<"new" | "rename" | null>(null);
  const [printKitchen, setPrintKitchen] = useState(true);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"products" | "ticket">("products");
  const showMobilePanel = (panel: "products" | "ticket") => { setMobilePanel(panel); window.scrollTo({ top: 0, behavior: "auto" }); };
  const unitCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const pendingCount = items.reduce((sum, item) => sum + item.quantity - item.sentQuantity, 0);
  const addProduct = (product: Product) => setPickerProduct(product);
  return <div className={`command-layout mobile-panel-${mobilePanel}`}>
    <div className="waiter-mobile-header"><div className="waiter-mobile-context"><button aria-label="Voltar às mesas" onClick={onBack}><ChevronLeft/></button><div><b>Mesa {String(table.number).padStart(2, "0")}</b><span>{table.tab?.name || "Comanda da mesa"}</span></div><button className="secondary" disabled={saving} onClick={() => showMobilePanel("ticket")}>Trocar comanda</button></div><div className="waiter-mobile-tabs" aria-label="Visualização da comanda"><button aria-pressed={mobilePanel === "products"} onClick={() => showMobilePanel("products")}>Produtos</button><button aria-pressed={mobilePanel === "ticket"} onClick={() => showMobilePanel("ticket")}>Comanda <span>{unitCount}</span></button></div></div>
    <section className="catalog"><button className="back" onClick={onBack}><ChevronLeft/> Voltar ao salão</button><div className="search"><Search/><input aria-label="Buscar produto ou categoria" placeholder="Buscar produto ou categoria" type="search" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button className="clear-product-search" aria-label="Limpar busca" onClick={() => setQuery("")}><X/></button>}</div><label className="waiter-mobile-category"><span>Categoria</span><select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item} value={item}>{item} ({item === "Todos" ? products.length : products.filter(product => product.category === item).length})</option>)}</select></label><div className="chips" aria-label="Categorias de produtos">{categories.map(item => <button key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>{error && <div className="auth-error">{error}</div>}<div className="product-grid">{!visible.length && <div className="empty"><Search/><b>Nenhum produto encontrado</b><button className="secondary" onClick={() => { setQuery(""); setCategory("Todos"); }}>Limpar filtros</button></div>}{visible.map(product => <button className="product-card" aria-label={`Adicionar ${product.name} · ${money(product.price)}`} disabled={saving} key={product.id} onClick={() => addProduct(product)}><span>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : "🌭"}</span><div><small>{product.category}</small><b>{product.name}</b><strong>{money(product.price)}</strong>{items.some(item => item.productId === product.id) && <small className="product-in-tab">{items.filter(item => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0)} na comanda</small>}</div><Plus/></button>)}</div></section><div className="waiter-mobile-summary"><div><b>{unitCount} {unitCount === 1 ? "item" : "itens"} · {money(total + service)}</b><small>{pendingCount ? `${pendingCount} por enviar à cozinha` : "Total com serviço"}</small></div><button className="primary" onClick={() => showMobilePanel("ticket")}>Ver comanda</button></div><aside className="ticket"><div className="named-tab-controls">
    <label className="field"><span>Comanda de quem?</span><select aria-label="Comanda por nome" value={table.tab?.id ?? ""} disabled={saving} onChange={event => onSelectTab(event.target.value)}>{!table.tabs.length && <option value="">Comanda da mesa</option>}{table.tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.name || "Comanda da mesa"} — {money(tab.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))}</option>)}</select></label>
    <div className="named-tab-actions"><button className="secondary" disabled={saving} onClick={() => setNameDialog("new")}><Plus size={16}/> Nova comanda</button>{table.tab && <button className="secondary" disabled={saving} onClick={() => setNameDialog("rename")}>Alterar nome</button>}</div>
    {table.tab && !items.length && <button className="back" disabled={saving} onClick={() => void onManageTab({ action: "CLOSE_EMPTY_TAB", tabId: table.tab!.id })}>Encerrar comanda vazia</button>}
  </div><div className="ticket-title"><div><span>COMANDA</span><h2>Mesa {String(table.number).padStart(2, "0")}</h2><strong className="tab-customer-name">{table.tab?.name || "Comanda da mesa"}</strong></div><span className="status-badge">{table.tab ? "Aberta" : "Nova"}</span></div><div className="ticket-items">{items.length === 0 ? <div className="empty"><ShoppingBag/><b>Comanda vazia</b><span>Adicione o primeiro produto para abrir a comanda.</span></div> : items.map(item => <div className="ticket-item" key={item.id}><span className="food">🌭</span><div><b>{item.productName}</b>{item.notes && <small className="item-preparation-note">Obs.: {item.notes}</small>}{item.selectedOptionsSnapshot?.length ? <small className="pos-cart-options">{item.selectedOptionsSnapshot.map(option => option.optionName).join(", ")}</small> : null}<small>{money(item.unitPrice)}{item.sentQuantity > 0 ? ` · ${item.sentQuantity} enviado(s)` : ""}</small><button className="remove-tab-item" disabled={saving} onClick={() => setCancelTarget(item)} aria-label={`Retirar item: ${item.productName}`}>Retirar item</button></div><div className="stepper"><button aria-label={`Diminuir ${item.productName}`} disabled={saving} onClick={() => { if (item.quantity <= item.sentQuantity) setCancelTarget(item); else void onQuantity(item, item.quantity - 1); }}>{item.quantity === 1 ? <X/> : <Minus/>}</button><b>{item.quantity}</b><button aria-label={`Aumentar ${item.productName}`} disabled={saving} onClick={() => void onQuantity(item, item.quantity + 1)}><Plus/></button></div></div>)}</div><div className="ticket-footer"><div><span>Subtotal</span><b>{money(total)}</b></div><div><span>Serviço ({serviceRate}%)</span><b>{money(service)}</b></div><div className="grand"><span>Total com serviço</span><b>{money(total + service)}</b></div><ConferencePrint tabId={table.tab?.id} disabled={saving || !items.length}/>{pending ? <><label className="field"><input type="checkbox" checked={printKitchen} onChange={event => setPrintKitchen(event.target.checked)} disabled={saving}/> Imprimir novos itens na cozinha</label><button className="primary wide" disabled={saving} onClick={() => void onSend(printKitchen)}><ChefHat/> Enviar novos itens para cozinha ({pendingCount})</button></> : <button className="primary wide" disabled={!items.length || saving} onClick={() => setCheckout(true)}><CircleDollarSign/> Pagar esta comanda</button>}</div></aside>{nameDialog && <NamedTabDialog initialName={nameDialog === "rename" ? table.tab?.name ?? "" : ""} title={nameDialog === "new" ? "Nova comanda" : "Alterar nome"} saving={saving} error={error} onClose={() => setNameDialog(null)} onSave={async name => { const ok = await onManageTab(nameDialog === "new" ? { action: "CREATE_TAB", tableId: table.id, name } : { action: "RENAME_TAB", tabId: table.tab!.id, name }); if (ok) setNameDialog(null); }}/>} {checkout && <Checkout tabId={table.tab?.id} label={`Mesa ${table.number} · ${table.tab?.name || "Comanda da mesa"}`} total={total} serviceAmount={service} onCancel={() => setCheckout(false)} onConfirm={onClose}/>} {cancelTarget && <RemoveTabItem item={items.find(item => item.id === cancelTarget.id) ?? cancelTarget} canCancelSentItems={canCancelSentItems} error={error} saving={saving} onClose={() => setCancelTarget(null)} onConfirm={async (quantity, reason, sent) => { const current = items.find(item => item.id === cancelTarget.id); if (!current) return false; const ok = sent ? await onCancelSent(current, quantity, reason) : await onQuantity(current, current.quantity - quantity); if (ok) setCancelTarget(null); return ok; }}/>} {pickerProduct && <IngredientPicker allowNotes submitError={error} product={pickerProduct} onClose={() => setPickerProduct(null)} onConfirm={async (_unitPrice, _selectedOptions, optionSelections, notes) => { if (await onAdd(pickerProduct, optionSelections, notes)) setPickerProduct(null); }} />}</div>;
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
      for (const ticket of tickets) printKitchenOrder({ establishmentName, stationName: ticket.station.name, label: orderLabel(order), orderId: order.id, sentAt: order.sentAt, items: ticket.items.map(item => ({ name: [item.productName, ...(item.selectedOptionsSnapshot ?? []).map(option => option.optionName), ...(item.notes ? [`OBS: ${item.notes}`] : [])].join(" — "), quantity: item.quantity - (item.cancelledQuantity ?? 0) })) });
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
    {filteredOrders.length === 0 ? <div className="big-empty"><ChefHat/><h2>Tudo em dia por aqui</h2><p>Novos pedidos enviados pelo salão, pelo PDV e pelo delivery aparecerão nesta tela.</p></div> : <div className="kds-grid">{filteredOrders.map(order => <article className={`kds-card ${statusLabels[order.status].replace(" ", "-").toLowerCase()}`} key={order.id}><div className="kds-head">{(() => { const label = kitchenOrderLabel(order); return <div><span>{label.kicker}</span><b>{label.title}</b>{label.detail && <small className="kds-head-detail">{label.detail}</small>}</div>; })()}<span><Clock3/> {new Date(order.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div><div className="kds-items">{order.items.map((item, index) => <div className={item.cancelledQuantity ? "cancelled" : ""} key={item.id ?? `${order.id}-${index}`}><b>{Math.max(0, item.quantity - (item.cancelledQuantity ?? 0))}×</b><span>{item.productName}{item.notes && <small className="item-preparation-note">Obs.: {item.notes}</small>}{item.selectedOptionsSnapshot?.length ? <small className="kds-item-options">{item.selectedOptionsSnapshot.map(option => option.optionName).join(", ")}</small> : null}{item.cancelledQuantity ? <small>{item.cancelledQuantity} cancelado(s)</small> : null}</span></div>)}</div><div className="kds-foot"><span>{statusLabels[order.status]}</span>{nextStatus[order.status] && <button disabled={saving || Boolean(order.delivery && order.status === "READY" && !deliveryFinished(order.delivery.status) && order.delivery.status !== "OUT_FOR_DELIVERY")} onClick={() => void onAdvance(order)}>{deliveryFinished(order.delivery?.status) ? "Encerrar na cozinha" : order.delivery && order.status === "READY" ? (requiresDelivery(order.delivery) ? "Aguardando saída no delivery" : "Aguardando conclusão no caixa") : order.status === "READY" ? "Entregar" : order.status === "PREPARING" ? "Marcar pronto" : "Iniciar preparo"}</button>}</div></article>)}</div>}
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

function Checkout({ tabId, label, total, serviceAmount, blockedReason, onCancel, onConfirm }: { blockedReason?: string; tabId?: string; label: string; total: number; serviceAmount: number; onCancel: () => void; onConfirm: (checkout: SaleCheckout) => Promise<boolean> }) {
  const [waiveService, setWaiveService] = useState(false);
  const [printReceiptRequested, setPrintReceiptRequested] = useState(true);
  const [paymentError, setPaymentError] = useState("");
  const grossTotal = Math.round((total + (waiveService ? 0 : serviceAmount)) * 100) / 100;
  const [payments, setPayments] = useState([{ method: "Pix", amount: "", receivedAmount: "" }]);
  const [discount, setDiscount] = useState(""); const [discountReason, setDiscountReason] = useState(""); const [loading, setLoading] = useState(false);
  return <div className="modal-bg"><div className="modal payment-modal"><button className="modal-close" onClick={onCancel}><X/></button><span className="modal-icon"><CircleDollarSign/></span><h2>Pagar comanda</h2><p><strong>{label}</strong></p><p>Este pagamento fecha apenas esta comanda.</p>{serviceAmount > 0 && <label className="service-waiver"><input type="checkbox" checked={waiveService} disabled={loading} onChange={event => { setWaiveService(event.target.checked); setPayments([{ method: payments[0]?.method ?? "Pix", amount: "", receivedAmount: "" }]); }}/><span>Retirar taxa de serviço a pedido do cliente ({money(serviceAmount)})</span></label>}<ConferencePrint tabId={tabId} disabled={loading} waiveService={waiveService} discount={Number(discount.replace(",", ".")) || 0}/><label className="receipt-print-option"><input type="checkbox" checked={printReceiptRequested} onChange={event => setPrintReceiptRequested(event.target.checked)} disabled={loading}/><span>Imprimir comprovante do pagamento</span></label><PaymentComposer grossTotal={grossTotal} discount={discount} setDiscount={setDiscount} discountReason={discountReason} setDiscountReason={setDiscountReason} payments={payments} setPayments={setPayments}/>{blockedReason && <p role="status" className="auth-error">{blockedReason}</p>}{paymentError && <p role="alert" className="auth-error">{paymentError}</p>}<button className="primary wide" disabled={loading || !!blockedReason} onClick={async () => { if (blockedReason) return; setLoading(true); setPaymentError(""); try { const ok = await onConfirm({ ...serializeCheckout(payments, discount, discountReason, grossTotal), waiveService, printReceipt: printReceiptRequested }); if (!ok) setPaymentError("Não foi possível concluir o pagamento. Confira o aviso do sistema e tente novamente."); } catch (cause) { setPaymentError(cause instanceof Error ? cause.message : "Não foi possível concluir o pagamento."); } finally { setLoading(false); } }}>{loading ? "Finalizando…" : "Confirmar pagamento"}</button></div></div>;
}
function NamedTabDialog({ initialName, title, saving, error, onClose, onSave }: { initialName: string; title: string; saving: boolean; error: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initialName);
  return <div className="modal-bg"><form className="modal" onSubmit={event => { event.preventDefault(); if (name.trim() && !saving) void onSave(name.trim()); }}><button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Fechar"><X/></button><h2>{title}</h2><p>Use o nome da pessoa ou do grupo que vai pagar esta conta.</p><label className="field"><span>Nome da comanda</span><input autoFocus maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Ana, Carlos, Família Silva" required /></label>{error && <p className="auth-error">{error}</p>}<button className="primary wide" type="submit" disabled={saving || !name.trim()}>{saving ? "Salvando…" : "Salvar comanda"}</button></form></div>;
}
function LinkedCommand({ error, onSelectTab, table, tab, products, serviceRate, onBack, onReload, onClose }: { error: string; onSelectTab: (id: string) => void; table: Table; tab: Tab; products: Product[]; serviceRate: number; onBack: () => void; onReload: () => Promise<void>; onClose: (checkout: SaleCheckout) => Promise<boolean> }) {
  const [adding, setAdding] = useState(false); const [checkout, setCheckout] = useState(false);
  const total = tab.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const pendingOrders = tab.orders.filter(order => !kitchenReady(order.status));
  const pending = pendingOrders.length > 0;
  const blockedReason = error || (pending ? `Aguardando a cozinha: ${pendingOrders.map((order, index) => `rodada ${index + 1} — ${statusLabels[order.status]}`).join("; ")}. Marque o preparo como pronto na Cozinha para liberar a confirmação. O status é atualizado automaticamente.` : undefined);
  return <div className="page-content"><button className="secondary" onClick={onBack}>Voltar às mesas</button><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>{table.tabs.map(candidate => <button key={candidate.id} className={candidate.id === tab.id ? "primary" : "secondary"} onClick={() => onSelectTab(candidate.id)}>{candidate.name || "Comanda da mesa"}</button>)}</div><h2>Mesa {table.number} · {tab.name}</h2><p>Pedido vinculado à mesa. Os acréscimos entram nesta mesma conta e somente a nova rodada vai para a cozinha.</p>
    <div className="ticket-items">{tab.items.map(item => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16, padding: "16px 0", borderBottom: "1px solid var(--line)" }} key={item.id}><div style={{ flex: 1, minWidth: 0 }}><b>{item.quantity} × {item.productName}</b><small style={{ display: "block" }}>{item.selectedOptionsSnapshot?.map(option => option.optionName).join(", ")}</small></div><b>{money(item.quantity * item.unitPrice)}</b></div>)}</div>
    <ConferencePrint tabId={tab.id}/><p>Subtotal: <b>{money(total)}</b> · Serviço: {money(Math.round(total * serviceRate) / 100)}</p>
    <button className="primary" onClick={() => setAdding(true)}>Acrescentar itens / adicionais</button>{" "}<button className="secondary" onClick={() => void onReload()}>Atualizar comanda</button>{" "}<button className="secondary" onClick={() => { setCheckout(true); void onReload(); }}>Pagar esta comanda</button>
    {blockedReason && <p role="status">{blockedReason}</p>}
    {adding && <DeliveryAddition order={{ ...tab.linkedOrder!, items: tab.items }} products={products} onClose={() => setAdding(false)} onSaved={onReload}/>}
    {checkout && <Checkout blockedReason={blockedReason} tabId={tab.id} label={`Mesa ${table.number} · ${tab.name}`} total={total} serviceAmount={Math.round(total * serviceRate) / 100} onCancel={() => setCheckout(false)} onConfirm={onClose}/>}
  </div>;
}

function ConferencePrint({ tabId, disabled, waiveService = false, discount = 0 }: { tabId?: string; disabled?: boolean; waiveService?: boolean; discount?: number }) {
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState("");
  return <><button type="button" className="secondary wide" disabled={disabled || printing || !tabId} onClick={async () => {
    setPrinting(true); setMessage("");
    try {
      const response = await fetch("/api/operations/floor/conference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tabId, waiveService, discount }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível imprimir a conferência.");
      if (typeof data.queued !== "boolean" || !data.receipt) throw new Error("Resposta inválida ao preparar a conferência. Atualize a página e tente novamente.");
      if (!data.queued) printReceipt(data.receipt, data.template);
      setMessage(data.queued ? "Conferência enviada à fila da impressora. A comanda continua aberta." : "Conferência preparada para impressão. A comanda continua aberta.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na impressão."); }
    finally { setPrinting(false); }
  }}><Printer/>{printing ? "Preparando conferência…" : "Imprimir conferência"}</button>{message && <p role="status">{message}</p>}</>;
}
