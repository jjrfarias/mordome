"use client";
import { isMarketplaceOrder, marketplaceLabel } from "@/lib/ifood-import";

import { DeliveryPrintButton, requestDeliveryPrint } from "./DeliveryPrintButton";
import { DeliveryAddition } from "./DeliveryAddition";
import { fulfillmentLabel, requiresDelivery, payableOrderStage, type OrderFulfillment } from "@/lib/order-fulfillment";

import { kitchenReady } from "@/lib/delivery-workflow";
import { useEffect, useState } from "react";
import { Bike, CircleDollarSign, MapPin, Minus, Package, Phone, Plus, Settings, Truck, X } from "lucide-react";
import { money, IngredientGroup, SelectedIngredientOption } from "@/lib/domain";
import { PaymentComposer, serializeCheckout, type SaleCheckout } from "./PaymentComposer";
import { DeliveryMap } from "./DeliveryMap";
import { MapPicker } from "./MapPicker";
import { IngredientPicker, productHasIngredientChoices } from "./IngredientPicker";
import { DeliveryAreaSettings, type DeliveryArea } from "./DeliveryAreaSettings";
import type { FiscalPrintInfo } from "@/lib/fiscal/print-info";

type DeliveryStatus = "RECEIVED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
type Product = { id: string; name: string; category: string; price: number; ingredientGroups?: IngredientGroup[] };
type Courier = { id: string; name: string };
type CourierLocation = { courierId: string; lat: number; lng: number; updatedAt: string };
type OrderItem = { id: string; productId: string | null; productName: string; quantity: number; unitPrice: number; selectedOptionsSnapshot?: SelectedIngredientOption[] | null };
type Order = { fulfillment?: OrderFulfillment; kitchenOrderId: string | null; kitchenStatus: string | null; id: string; customerName: string; customerPhone: string; address: string; destinationLat: number | null; destinationLng: number | null; notes: string | null; status: DeliveryStatus; origin: "INTERNAL" | "ONLINE" | "IFOOD" | "FOOD99"; ifood?: { displayId: string; payment: string; subtotalCents: number } | null; courierId: string | null; deliveryAreaId: string | null; deliveryFee: number; saleId: string | null; createdAt: string; items: OrderItem[] };

const statusLabels: Record<DeliveryStatus, string> = { RECEIVED: "Recebido", PREPARING: "Em preparo", OUT_FOR_DELIVERY: "Saiu para entrega", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
const nextStatus: Partial<Record<DeliveryStatus, DeliveryStatus>> = { RECEIVED: "PREPARING", PREPARING: "OUT_FOR_DELIVERY" };
const nextActionLabel: Record<string, string> = { PREPARING: "Iniciar preparo", OUT_FOR_DELIVERY: "Saiu para entrega" };
const boardColumns: DeliveryStatus[] = ["RECEIVED", "PREPARING", "OUT_FOR_DELIVERY"];

export function DeliveryManagement({ establishmentId, establishmentName, onFinishSale, onToast }: { establishmentId: string; establishmentName: string; onFinishSale: (items: { id: string; quantity: number }[], checkout: SaleCheckout, deliveryOrderId: string) => Promise<{ ok: boolean; fiscal: FiscalPrintInfo }>; onToast: (message: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [courierLocations, setCourierLocations] = useState<CourierLocation[]>([]);
  const [deliveryAreas, setDeliveryAreas] = useState<DeliveryArea[]>([]);
  const [canReprint, setCanReprint] = useState(false);
  const [paidOrder, setPaidOrder] = useState<Order | null>(null);
  const [canManageDeliveryAreas, setCanManageDeliveryAreas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefreshAt, setLastRefreshAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingOrder, setAddingOrder] = useState<Order | null>(null);
  const [managingAreas, setManagingAreas] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);
  const [locationOrder, setLocationOrder] = useState<Order | null>(null);
  const [correctedPoint, setCorrectedPoint] = useState<{ lat: number; lng: number } | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/operations/delivery", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o delivery.");
      setLastRefreshAt(Date.now()); setCanReprint(Boolean(data.canReprint));
      setOrders(data.orders ?? []); setProducts(data.products ?? []); setCouriers(data.couriers ?? []); setCourierLocations(data.courierLocations ?? []); setDeliveryAreas(data.deliveryAreas ?? []); setCanManageDeliveryAreas(Boolean(data.canManageDeliveryAreas)); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o delivery."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); const interval = setInterval(() => void load(), 10000); return () => clearInterval(interval); }, [establishmentId]);

  const act = async (body: Record<string, unknown>, successMessage?: string) => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations/delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a ação.");
      await load(); if (successMessage) onToast(successMessage); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação."); return false; } finally { setSaving(false); }
  };

  const active = orders.filter(order => order.status !== "DELIVERED" && order.status !== "CANCELLED");
  const currentCheckoutOrder = checkoutOrder ? orders.find(order => order.id === checkoutOrder.id) ?? checkoutOrder : null;
  const outForDelivery = orders.filter(order => order.status === "OUT_FOR_DELIVERY").length;

  return <div className="page-content">
    <div className="hero-row"><div><span className="section-kicker">Pedidos online e delivery</span><p>Entrega, retirada e consumo na loja, identificados por cliente.</p></div><div style={{ display: "flex", gap: 8 }}>{canManageDeliveryAreas && <button className="secondary" onClick={() => setManagingAreas(true)}><Settings /> Áreas de entrega</button>}<button className="primary" onClick={() => setCreating(true)}><Plus /> Novo pedido</button></div></div>
    {error && <div className="auth-error">{error}</div>}
    {paidOrder && <section className="ticket"><h2>Pagamento concluído — {paidOrder.customerName}</h2><p>O pedido já foi pago. A impressão não realiza outra cobrança.</p><DeliveryPrintButton orderId={paidOrder.id} mode="RECEIPT"/><button className="back" onClick={() => setPaidOrder(null)}>Fechar</button></section>}
    <div className="stats-row">
      <div className="stat"><div><Package /></div><section><b>{active.length}</b><span>pedidos ativos</span></section></div>
      <div className="stat"><div><Truck /></div><section><b>{outForDelivery}</b><span>em rota</span></section></div>
      <div className="stat"><div><Bike /></div><section><b>{couriers.length}</b><span>entregadores disponíveis</span></section></div>
    </div>
    <div className="delivery-courier-status" aria-label="Última localização dos entregadores">{couriers.map(courier => {
      const location = courierLocations.find(point => point.courierId === courier.id);
      const stale = location && lastRefreshAt - new Date(location.updatedAt).getTime() > 120000;
      return <span key={courier.id}><strong>{courier.name}</strong> · {location ? `${stale ? "Localização antiga" : "Atualizado"} às ${new Date(location.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Sem localização"}</span>;
    })}</div>
    <DeliveryMap
      destinations={active.filter(order => order.destinationLat !== null && order.destinationLng !== null).map(order => ({ orderId: order.id, lat: order.destinationLat!, lng: order.destinationLng!, label: order.customerName }))}
      couriers={courierLocations.map(location => ({ courierId: location.courierId, lat: location.lat, lng: location.lng, label: couriers.find(candidate => candidate.id === location.courierId)?.name ?? "Entregador" }))}
      routes={active.filter(order => order.status === "OUT_FOR_DELIVERY" && order.courierId && order.destinationLat !== null && order.destinationLng !== null).map(order => ({ courierId: order.courierId!, destination: { lat: order.destinationLat!, lng: order.destinationLng! }, label: order.customerName }))}
    />
    {loading ? <div className="empty"><span>Carregando pedidos…</span></div> : active.length === 0 ? <div className="big-empty"><Package /><h2>Nenhum pedido ativo</h2><p>Crie um novo pedido de delivery para começar.</p></div> : <div className="kds-grid">
      {boardColumns.flatMap(status => active.filter(order => order.status === status)).map(order => {
        const total = order.ifood ? order.ifood.subtotalCents / 100 : order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) + order.deliveryFee;
        const delivery = requiresDelivery(order);
        const waitingKitchen = Boolean(order.kitchenOrderId) && !kitchenReady(order.kitchenStatus);
        const courier = couriers.find(candidate => candidate.id === order.courierId);
        return <article key={order.id} className={`kds-card ${order.status === "PREPARING" ? "em-preparo" : order.status === "OUT_FOR_DELIVERY" ? "pronto" : ""}`}>
          <div className="kds-head"><div><span>{statusLabels[order.status]}{isMarketplaceOrder(order.origin) ? ` · ${marketplaceLabel(order.origin)} #${order.ifood?.displayId ?? ""}` : order.origin === "ONLINE" ? " · Pedido online" : ""}</span><b>{order.customerName}</b><small>{fulfillmentLabel(order)}</small></div><span><Phone />{order.customerPhone}</span></div>
          <div className="kds-items">
            {isMarketplaceOrder(order.origin) && <p><strong>{order.ifood?.payment === "PAID_ONLINE" ? `PAGO NO ${marketplaceLabel(order.origin).toUpperCase()} — NÃO COBRAR` : `Confira o pagamento no Gestor do ${marketplaceLabel(order.origin)}`}</strong><br />Aceite, entrega e cancelamento continuam no Gestor.</p>}
            {order.kitchenOrderId && <p style={{ fontSize: 12 }}>Cozinha: {order.kitchenStatus === "READY" ? "Pronto para retirada" : order.kitchenStatus === "DELIVERED" ? "Retirado da cozinha" : order.kitchenStatus === "PREPARING" ? "Em preparo" : order.kitchenStatus === "CANCELLED" ? "Cancelado" : "Aguardando preparo"}</p>}
            <div style={{ marginBottom: 10, fontSize: 11, color: "var(--muted)", display: "flex", gap: 6, alignItems: "flex-start" }}><MapPin style={{ width: 14, flex: "0 0 auto", marginTop: 1 }} />{order.address}</div>
            {delivery && <button type="button" className="secondary" onClick={() => { setLocationOrder(order); setCorrectedPoint(null); }}>{order.destinationLat !== null ? "Corrigir ponto no mapa" : "Marcar ponto de entrega"}</button>}
            {order.items.map(item => <div key={item.id}><span>{item.quantity}x</span><span>{item.productName}{item.selectedOptionsSnapshot?.length ? <small className="kds-item-options">{item.selectedOptionsSnapshot.map(option => option.optionName).join(", ")}</small> : null}</span></div>)}
            {order.deliveryFee > 0 && <div><span /><span>Taxa de entrega <em style={{ fontStyle: "normal", color: "var(--muted)" }}>{money(order.deliveryFee)}</em></span></div>}
            {delivery && !isMarketplaceOrder(order.origin) && <label className="field" style={{ marginTop: 10 }}><span>Entregador</span><select value={order.courierId ?? ""} disabled={saving} onChange={event => void act({ action: "ASSIGN_COURIER", orderId: order.id, courierId: event.target.value || null })}>
              <option value="">Sem entregador definido</option>
              {couriers.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select></label>}
            {courier && <small style={{ display: "block", marginTop: 4, color: "var(--muted)", fontSize: 9 }}>Atribuído: {courier.name}</small>}
          </div>
          <div style={{ margin: "0 18px 12px" }}><DeliveryPrintButton orderId={order.id} mode="CONFERENCE" disabled={saving}/></div>
          <div className="kds-foot">
            <span>{order.origin === "FOOD99" ? "Itens: " : ""}{money(total)}</span>
            {isMarketplaceOrder(order.origin) ? <button disabled={saving || (order.status !== "RECEIVED" && !kitchenReady(order.kitchenStatus))} onClick={async () => {
              if (order.status === "RECEIVED") { await act({ action: "CHANGE_STATUS", orderId: order.id, status: "PREPARING" }); return; }
              setSaving(true); setError("");
              try { const response = await fetch("/api/integrations/ifood-import", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id }) }); const body = await response.json(); if (!response.ok) throw Error(body.error ?? "Não foi possível encerrar a produção."); await load(); onToast("Produção encerrada no Mordomê. Atualize a entrega no Gestor de origem."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao concluir."); } finally { setSaving(false); }
            }}>{order.status === "RECEIVED" ? "Iniciar preparo" : kitchenReady(order.kitchenStatus) ? "Retirado · encerrar produção" : "Aguardando cozinha"}</button> : payableOrderStage(order) ? <button disabled={saving} onClick={() => setCheckoutOrder(order)}><CircleDollarSign /> Cobrar e concluir</button> : nextStatus[order.status] ? <button disabled={saving || (nextStatus[order.status] === "OUT_FOR_DELIVERY" && (!order.courierId || waitingKitchen))} title={nextStatus[order.status] === "OUT_FOR_DELIVERY" && !order.courierId ? "Defina o entregador antes de iniciar a rota." : undefined} onClick={() => void act({ action: "CHANGE_STATUS", orderId: order.id, status: nextStatus[order.status] }, `Pedido de ${order.customerName}: ${statusLabels[nextStatus[order.status]!]}`)}>{nextStatus[order.status] === "OUT_FOR_DELIVERY" && waitingKitchen ? "Aguardando cozinha" : nextActionLabel[nextStatus[order.status]!]}</button> : null}
          </div>
          {!isMarketplaceOrder(order.origin) && !order.saleId && ["RECEIVED", "PREPARING"].includes(order.status) && <button className="secondary" style={{ margin: "0 18px 12px" }} onClick={() => setAddingOrder(order)}><Plus/> Acrescentar itens / adicionais</button>}
          <button type="button" className="cancel-sent-item" style={{ margin: "0 18px 14px" }} disabled={saving} onClick={() => { if (window.confirm(`Cancelar o pedido de ${order.customerName}? O tíquete da cozinha também será cancelado.${isMarketplaceOrder(order.origin) ? " Cancele também no Gestor de origem; esta ação só altera o Mordomê." : ""}`)) void act({ action: "CHANGE_STATUS", orderId: order.id, status: "CANCELLED" }, "Pedido cancelado"); }}>Cancelar pedido</button>
        </article>;
      })}
    </div>}

    {orders.some(order => order.saleId && order.status === "DELIVERED") && <details style={{ marginTop: 20 }}><summary>Comprovantes dos pedidos pagos recentes</summary><p>Pedidos pagos presentes nos últimos 100 pedidos carregados.</p>{orders.filter(order => order.saleId && order.status === "DELIVERED").map(order => <section key={order.id} style={{ padding: 12 }}><b>{order.customerName}</b><p>{new Date(order.createdAt).toLocaleString("pt-BR")}</p><DeliveryPrintButton orderId={order.id} mode="RECEIPT" reprint={canReprint}/></section>)}</details>}
    {addingOrder && <DeliveryAddition order={addingOrder} products={products} onClose={() => setAddingOrder(null)} onSaved={async () => { setAddingOrder(null); await load(); onToast("Pedido atualizado. Complemento enviado à cozinha."); }}/>}
    {locationOrder && <div className="modal-bg"><div className="modal" style={{ width: "min(650px,100%)" }}>
      <button className="modal-close" aria-label="Fechar correção do ponto" disabled={saving} onClick={() => setLocationOrder(null)}><X /></button>
      <h2>Corrigir ponto de entrega</h2><p>{locationOrder.address}</p>
      <p>O ponto anterior pode ser uma aproximação do CEP. Toque na entrada do endereço correto para confirmar.</p>
      <MapPicker value={correctedPoint} center={locationOrder.destinationLat !== null && locationOrder.destinationLng !== null ? { lat: locationOrder.destinationLat, lng: locationOrder.destinationLng } : null} onChange={setCorrectedPoint} height={320} />
      {error && <p role="alert" className="auth-error">{error}</p>}
      <button type="button" className="primary wide" disabled={!correctedPoint || saving} onClick={async () => { if (correctedPoint && await act({ action: "SET_LOCATION", orderId: locationOrder.id, destinationLat: correctedPoint.lat, destinationLng: correctedPoint.lng }, "Ponto de entrega corrigido")) setLocationOrder(null); }}>{saving ? "Salvando…" : "Salvar ponto de entrega"}</button>
    </div></div>}
    {creating && <NewOrderModal products={products} deliveryAreas={deliveryAreas} saving={saving} onClose={() => setCreating(false)} onCreate={async payload => { const ok = await act({ action: "CREATE", ...payload }, "Pedido de delivery criado"); if (ok) setCreating(false); return ok; }} />}
    {currentCheckoutOrder && <Checkout key={currentCheckoutOrder.id} order={currentCheckoutOrder} onCancel={() => setCheckoutOrder(null)} onConfirm={async checkout => { const items = currentCheckoutOrder.items.map(item => ({ id: item.productId ?? "", quantity: item.quantity })); const { ok } = await onFinishSale(items, checkout, currentCheckoutOrder.id); if (ok) { setPaidOrder(currentCheckoutOrder); setCheckoutOrder(null); await load(); try { onToast(`Pagamento concluído. ${await requestDeliveryPrint(currentCheckoutOrder.id, "RECEIPT")}`); } catch { onToast("Pagamento concluído. Não foi possível confirmar a impressão; use Imprimir comprovante."); } } return ok; }} />}
    {managingAreas && <DeliveryAreaSettings onClose={() => setManagingAreas(false)} onChanged={() => void load()} />}
  </div>;
}

type NewOrderLine = { lineId: string; productId: string; productName: string; unitPrice: number; quantity: number; selectedOptions: SelectedIngredientOption[]; optionSelections: { groupId: string; optionIds: string[] }[] };

function NewOrderModal({ products, deliveryAreas, saving, onClose, onCreate }: { products: Product[]; deliveryAreas: DeliveryArea[]; saving: boolean; onClose: () => void; onCreate: (payload: { customerName: string; customerPhone: string; address: string; destinationLat?: number; destinationLng?: number; notes?: string; deliveryAreaId?: string; items: { productId: string; quantity: number; selectedOptions?: { groupId: string; optionIds: string[] }[] }[] }) => Promise<boolean> }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryAreaId, setDeliveryAreaId] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [knownCustomer, setKnownCustomer] = useState<{ name: string; ordersCount: number; totalSpent: number; lastAddress: string | null } | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [lines, setLines] = useState<NewOrderLine[]>([]);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);

  // Reconhecimento de cliente repetido (ADR 0047): busca por telefone com debounce, autopreenche
  // nome/endereço só se o atendente ainda não tiver digitado nada naqueles campos.
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void (async () => {
        const digits = customerPhone.replace(/\D/g, "");
        if (digits.length < 8) { setKnownCustomer(null); return; }
        try {
          const response = await fetch(`/api/operations/customer-lookup?phone=${encodeURIComponent(customerPhone)}`, { cache: "no-store", signal: controller.signal });
          const data = await response.json().catch(() => ({}));
          if (!data.customer) { setKnownCustomer(null); return; }
          setKnownCustomer(data.customer);
          setCustomerName(current => current.trim() ? current : data.customer.name);
          setAddress(current => current.trim() || !data.customer.lastAddress ? current : data.customer.lastAddress);
        } catch { /* pesquisa abortada (telefone mudou de novo) ou rede indisponível — segue sem autopreencher */ }
      })();
    }, 500);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [customerPhone]);

  const categories = [...new Set(products.map(product => product.category))];
  const plainItems = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
  const optionItems = lines.map(line => ({ productId: line.productId, quantity: line.quantity, selectedOptions: line.optionSelections }));
  const items = [...plainItems, ...optionItems];
  const valid = customerName.trim().length > 1 && customerPhone.trim().length > 7 && address.trim().length > 4 && items.length > 0 && (deliveryAreas.length === 0 || Boolean(deliveryAreaId));
  const itemsTotal = Object.entries(quantities).reduce((sum, [productId, quantity]) => sum + (products.find(product => product.id === productId)?.price ?? 0) * quantity, 0) + lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const selectedArea = deliveryAreas.find(area => area.id === deliveryAreaId);
  const orderTotal = itemsTotal + (selectedArea?.deliveryFee ?? 0);

  const addLine = (product: Product, unitPrice: number, selectedOptions: SelectedIngredientOption[], optionSelections: { groupId: string; optionIds: string[] }[]) => {
    setLines(current => [...current, { lineId: crypto.randomUUID(), productId: product.id, productName: product.name, unitPrice, quantity: 1, selectedOptions, optionSelections }]);
  };
  const changeLineQuantity = (lineId: string, delta: number) => setLines(current => current.map(line => line.lineId === lineId ? { ...line, quantity: line.quantity + delta } : line).filter(line => line.quantity > 0));

  return <div className="modal-bg"><div className="modal" style={{ width: "min(560px,100%)" }}>
    <button className="modal-close" onClick={onClose}><X /></button>
    <span className="modal-icon"><Package /></span>
    <h2>Novo pedido de delivery</h2>
    <p>Endereço e itens do pedido para acompanhar até a entrega.</p>
    <label className="field"><span>Cliente</span><input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Nome do cliente" /></label>
    <label className="field"><span>Telefone</span><input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="(00) 00000-0000" /></label>
    {knownCustomer && <p className="section-note">Cliente conhecido: {knownCustomer.ordersCount} pedido(s) · {money(knownCustomer.totalSpent)} em compras.</p>}
    <label className="field"><span>Endereço</span><input value={address} onChange={event => { setAddress(event.target.value); setPoint(null); }} placeholder="Rua, número, bairro" /></label>
    <label className="field"><span>Observações</span><input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Opcional" /></label>
    {deliveryAreas.length > 0 && <label className="field"><span>Área de entrega</span><select value={deliveryAreaId} onChange={event => setDeliveryAreaId(event.target.value)}>
      <option value="">Sem área cadastrada (taxa por fora)</option>
      {deliveryAreas.map(area => <option key={area.id} value={area.id}>{area.name} · {money(area.deliveryFee)}</option>)}
    </select><small style={{ color: "var(--muted)" }}>Necessário para calcular a taxa do pedido.</small></label>}
    <div style={{ marginTop: 12 }}><MapPicker value={point} onChange={setPoint} /></div>
    <div className="permission-groups" style={{ marginTop: 14 }}>
      {categories.map(category => <div key={category} className="permission-group">
        <small>{category}</small>
        {products.filter(product => product.category === category).map(product => productHasIngredientChoices(product)
          ? <button type="button" key={product.id} className="permission-check" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setPickerProduct(product)}>
              <span>{product.name} <em style={{ fontStyle: "normal", color: "var(--muted)" }}>{money(product.price)}</em></span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 800, color: "var(--gold)" }}><Plus style={{ width: 13, height: 13 }} /> Personalizar</span>
            </button>
          : <label key={product.id} className="permission-check" style={{ justifyContent: "space-between" }}>
              <span>{product.name} <em style={{ fontStyle: "normal", color: "var(--muted)" }}>{money(product.price)}</em></span>
              <input type="number" min={0} max={99} inputMode="numeric" style={{ width: 52, minHeight: 28, border: "1px solid var(--line)", borderRadius: 6, padding: "2px 6px" }} value={quantities[product.id] ?? 0} onChange={event => setQuantities(current => ({ ...current, [product.id]: Math.max(0, Number(event.target.value) || 0) }))} />
            </label>)}
      </div>)}
    </div>
    {lines.length > 0 && <div className="permission-groups" style={{ marginTop: 10 }}>
      <div className="permission-group">
        <small>Itens personalizados</small>
        {lines.map(line => <div key={line.lineId} className="permission-check" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span><b>{line.productName}</b>{line.selectedOptions.length ? <small className="pos-cart-options">{line.selectedOptions.map(option => option.optionName).join(", ")}</small> : null} <em style={{ fontStyle: "normal", color: "var(--muted)" }}>{money(line.unitPrice)}</em></span>
          <div className="stepper"><button type="button" onClick={() => changeLineQuantity(line.lineId, -1)}>{line.quantity === 1 ? <X /> : <Minus />}</button><b>{line.quantity}</b><button type="button" onClick={() => changeLineQuantity(line.lineId, 1)}><Plus /></button></div>
        </div>)}
      </div>
    </div>}
    {items.length > 0 && <div className="delivery-order-summary" style={{ marginTop: 12 }}>
      <div className="delivery-order-summary-row"><span>Subtotal</span><b>{money(itemsTotal)}</b></div>
      {selectedArea && <div className="delivery-order-summary-row"><span>Taxa de entrega ({selectedArea.name})</span><b>{money(selectedArea.deliveryFee)}</b></div>}
      <div className="delivery-order-summary-row total"><span>Total do pedido</span><b>{money(orderTotal)}</b></div>
    </div>}
    <button className="primary wide" style={{ marginTop: 16 }} disabled={!valid || saving} onClick={() => void onCreate({ customerName: customerName.trim(), customerPhone: customerPhone.trim(), address: address.trim(), destinationLat: point?.lat, destinationLng: point?.lng, notes: notes.trim() || undefined, deliveryAreaId: deliveryAreaId || undefined, items })}>{saving ? "Criando…" : "Criar pedido"}</button>
    {pickerProduct && <IngredientPicker product={pickerProduct} onClose={() => setPickerProduct(null)} onConfirm={(unitPrice, selectedOptions, optionSelections) => { addLine(pickerProduct, unitPrice, selectedOptions, optionSelections); setPickerProduct(null); }} />}
  </div></div>;
}

function Checkout({ order, onCancel, onConfirm }: { order: Order; onCancel: () => void; onConfirm: (checkout: SaleCheckout) => Promise<boolean> }) {
  const total = order.ifood ? order.ifood.subtotalCents / 100 : order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) + order.deliveryFee;
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [payments, setPayments] = useState([{ method: "Pix", amount: "", receivedAmount: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const waitingKitchen = Boolean(order.kitchenOrderId) && !kitchenReady(order.kitchenStatus);
  const canComplete = !order.saleId && payableOrderStage(order) && !waitingKitchen;
  const confirm = async () => {
    if (!canComplete || saving) return;
    setSaving(true); setError("");
    try {
      const ok = await onConfirm(serializeCheckout(payments, discount, discountReason, total));
      if (!ok) setError("Não foi possível concluir o pagamento. Confira a mensagem da operação.");
    } catch { setError("Não foi possível conectar ao servidor. Tente novamente."); }
    finally { setSaving(false); }
  };

  return <div className="modal-bg"><div className="modal">
    <button className="modal-close" onClick={onCancel}><X /></button>
    <span className="modal-icon"><CircleDollarSign /></span>
    <h2>Cobrar pedido</h2>
    {waitingKitchen && <p role="status" className="auth-error">O pedido ou um complemento ainda aguarda a cozinha. Na tela Cozinha, marque todos os tíquetes deste cliente como prontos quando o preparo terminar. A cobrança será liberada automaticamente aqui.</p>}
    {!waitingKitchen && !canComplete && <p role="status" className="auth-error">Este pedido mudou de etapa ou já foi pago. Feche esta janela e confira o pedido.</p>}
    <p>Pedido de {order.customerName} — {money(total)}{order.deliveryFee > 0 ? ` (inclui ${money(order.deliveryFee)} de taxa de entrega)` : ""}</p>
    {error && <div className="auth-error">{error}</div>}
    <PaymentComposer grossTotal={total} discount={discount} setDiscount={setDiscount} discountReason={discountReason} setDiscountReason={setDiscountReason} payments={payments} setPayments={setPayments} />
    <DeliveryPrintButton orderId={order.id} mode="CONFERENCE" discount={Number(discount.replace(",", ".")) || 0} disabled={saving}/>
    <p>Ao concluir o pagamento, o comprovante será enviado à impressora configurada.</p>
    <button className="primary wide" disabled={saving || !canComplete} onClick={() => void confirm()}>{saving ? "Concluindo…" : waitingKitchen ? "Aguardando cozinha" : "Cobrar e concluir"}</button>
  </div></div>;
}
