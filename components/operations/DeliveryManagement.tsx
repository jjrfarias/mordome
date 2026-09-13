"use client";

import { useEffect, useState } from "react";
import { Bike, CircleDollarSign, MapPin, Package, Phone, Plus, Truck, X } from "lucide-react";
import { money } from "@/lib/domain";
import { PaymentComposer, serializeCheckout, type SaleCheckout } from "./PaymentComposer";
import { DeliveryMap } from "./DeliveryMap";
import { MapPicker } from "./MapPicker";

type DeliveryStatus = "RECEIVED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
type Product = { id: string; name: string; category: string; price: number };
type Courier = { id: string; name: string };
type CourierLocation = { courierId: string; lat: number; lng: number; updatedAt: string };
type OrderItem = { id: string; productId: string | null; productName: string; quantity: number; unitPrice: number };
type Order = { id: string; customerName: string; customerPhone: string; address: string; destinationLat: number | null; destinationLng: number | null; notes: string | null; status: DeliveryStatus; origin: "INTERNAL" | "ONLINE"; courierId: string | null; saleId: string | null; createdAt: string; items: OrderItem[] };

const statusLabels: Record<DeliveryStatus, string> = { RECEIVED: "Recebido", PREPARING: "Em preparo", OUT_FOR_DELIVERY: "Saiu para entrega", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
const nextStatus: Partial<Record<DeliveryStatus, DeliveryStatus>> = { RECEIVED: "PREPARING", PREPARING: "OUT_FOR_DELIVERY" };
const nextActionLabel: Record<string, string> = { PREPARING: "Iniciar preparo", OUT_FOR_DELIVERY: "Saiu para entrega" };
const boardColumns: DeliveryStatus[] = ["RECEIVED", "PREPARING", "OUT_FOR_DELIVERY"];

export function DeliveryManagement({ establishmentId, establishmentName, onFinishSale, onToast }: { establishmentId: string; establishmentName: string; onFinishSale: (items: { id: string; quantity: number }[], checkout: SaleCheckout, deliveryOrderId: string) => Promise<boolean>; onToast: (message: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [courierLocations, setCourierLocations] = useState<CourierLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/operations/delivery", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o delivery.");
      setOrders(data.orders ?? []); setProducts(data.products ?? []); setCouriers(data.couriers ?? []); setCourierLocations(data.courierLocations ?? []); setError("");
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
  const outForDelivery = orders.filter(order => order.status === "OUT_FOR_DELIVERY").length;

  return <div className="page-content">
    <div className="hero-row"><div><span className="section-kicker">Central de delivery</span><p>Pedidos com endereço, entregador e etapas de entrega.</p></div><button className="primary" onClick={() => setCreating(true)}><Plus /> Novo pedido</button></div>
    {error && <div className="auth-error">{error}</div>}
    <div className="stats-row">
      <div className="stat"><div><Package /></div><section><b>{active.length}</b><span>pedidos ativos</span></section></div>
      <div className="stat"><div><Truck /></div><section><b>{outForDelivery}</b><span>em rota</span></section></div>
      <div className="stat"><div><Bike /></div><section><b>{couriers.length}</b><span>entregadores disponíveis</span></section></div>
    </div>
    <DeliveryMap
      destinations={active.filter(order => order.destinationLat !== null && order.destinationLng !== null).map(order => ({ orderId: order.id, lat: order.destinationLat!, lng: order.destinationLng!, label: order.customerName }))}
      couriers={courierLocations.map(location => ({ courierId: location.courierId, lat: location.lat, lng: location.lng, label: couriers.find(candidate => candidate.id === location.courierId)?.name ?? "Entregador" }))}
      routes={active.filter(order => order.status === "OUT_FOR_DELIVERY" && order.courierId && order.destinationLat !== null && order.destinationLng !== null).map(order => ({ courierId: order.courierId!, destination: { lat: order.destinationLat!, lng: order.destinationLng! }, label: order.customerName }))}
    />
    {loading ? <div className="empty"><span>Carregando pedidos…</span></div> : active.length === 0 ? <div className="big-empty"><Package /><h2>Nenhum pedido ativo</h2><p>Crie um novo pedido de delivery para começar.</p></div> : <div className="kds-grid">
      {boardColumns.flatMap(status => active.filter(order => order.status === status)).map(order => {
        const total = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
        const courier = couriers.find(candidate => candidate.id === order.courierId);
        return <article key={order.id} className={`kds-card ${order.status === "PREPARING" ? "em-preparo" : order.status === "OUT_FOR_DELIVERY" ? "pronto" : ""}`}>
          <div className="kds-head"><div><span>{statusLabels[order.status]}{order.origin === "ONLINE" ? " · Pedido online" : ""}</span><b>{order.customerName}</b></div><span><Phone />{order.customerPhone}</span></div>
          <div className="kds-items">
            <div style={{ marginBottom: 10, fontSize: 11, color: "var(--muted)", display: "flex", gap: 6, alignItems: "flex-start" }}><MapPin style={{ width: 14, flex: "0 0 auto", marginTop: 1 }} />{order.address}</div>
            {order.items.map(item => <div key={item.id}><span>{item.quantity}x</span><span>{item.productName}</span></div>)}
            <label className="field" style={{ marginTop: 10 }}><span>Entregador</span><select value={order.courierId ?? ""} disabled={saving} onChange={event => void act({ action: "ASSIGN_COURIER", orderId: order.id, courierId: event.target.value || null })}>
              <option value="">Sem entregador definido</option>
              {couriers.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select></label>
            {courier && <small style={{ display: "block", marginTop: 4, color: "var(--muted)", fontSize: 9 }}>Atribuído: {courier.name}</small>}
          </div>
          <div className="kds-foot">
            <span>{money(total)}</span>
            {order.status === "OUT_FOR_DELIVERY" ? <button onClick={() => setCheckoutOrder(order)}><CircleDollarSign /> Cobrar e concluir</button> : nextStatus[order.status] ? <button disabled={saving} onClick={() => void act({ action: "CHANGE_STATUS", orderId: order.id, status: nextStatus[order.status] }, `Pedido de ${order.customerName}: ${statusLabels[nextStatus[order.status]!]}`)}>{nextActionLabel[nextStatus[order.status]!]}</button> : null}
          </div>
          <button type="button" className="cancel-sent-item" style={{ margin: "0 18px 14px" }} disabled={saving} onClick={() => void act({ action: "CHANGE_STATUS", orderId: order.id, status: "CANCELLED" }, "Pedido cancelado")}>Cancelar pedido</button>
        </article>;
      })}
    </div>}

    {creating && <NewOrderModal products={products} saving={saving} onClose={() => setCreating(false)} onCreate={async payload => { const ok = await act({ action: "CREATE", ...payload }, "Pedido de delivery criado"); if (ok) setCreating(false); return ok; }} />}
    {checkoutOrder && <Checkout order={checkoutOrder} onCancel={() => setCheckoutOrder(null)} onConfirm={async checkout => { const items = checkoutOrder.items.map(item => ({ id: item.productId ?? "", quantity: item.quantity })); const ok = await onFinishSale(items, checkout, checkoutOrder.id); if (ok) { onToast(`Pedido de ${checkoutOrder.customerName} entregue e pago`); setCheckoutOrder(null); await load(); } return ok; }} />}
  </div>;
}

function NewOrderModal({ products, saving, onClose, onCreate }: { products: Product[]; saving: boolean; onClose: () => void; onCreate: (payload: { customerName: string; customerPhone: string; address: string; destinationLat?: number; destinationLng?: number; notes?: string; items: { productId: string; quantity: number }[] }) => Promise<boolean> }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const categories = [...new Set(products.map(product => product.category))];
  const items = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
  const valid = customerName.trim().length > 1 && customerPhone.trim().length > 7 && address.trim().length > 4 && items.length > 0;

  return <div className="modal-bg"><div className="modal" style={{ width: "min(560px,100%)" }}>
    <button className="modal-close" onClick={onClose}><X /></button>
    <span className="modal-icon"><Package /></span>
    <h2>Novo pedido de delivery</h2>
    <p>Endereço e itens do pedido para acompanhar até a entrega.</p>
    <label className="field"><span>Cliente</span><input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Nome do cliente" /></label>
    <label className="field"><span>Telefone</span><input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="(00) 00000-0000" /></label>
    <label className="field"><span>Endereço</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder="Rua, número, bairro" /></label>
    <label className="field"><span>Observações</span><input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Opcional" /></label>
    <div style={{ marginTop: 12 }}><MapPicker value={point} onChange={setPoint} /></div>
    <div className="permission-groups" style={{ marginTop: 14 }}>
      {categories.map(category => <div key={category} className="permission-group">
        <small>{category}</small>
        {products.filter(product => product.category === category).map(product => <label key={product.id} className="permission-check" style={{ justifyContent: "space-between" }}>
          <span>{product.name} <em style={{ fontStyle: "normal", color: "var(--muted)" }}>{money(product.price)}</em></span>
          <input type="number" min={0} max={99} inputMode="numeric" style={{ width: 52, minHeight: 28, border: "1px solid var(--line)", borderRadius: 6, padding: "2px 6px" }} value={quantities[product.id] ?? 0} onChange={event => setQuantities(current => ({ ...current, [product.id]: Math.max(0, Number(event.target.value) || 0) }))} />
        </label>)}
      </div>)}
    </div>
    <button className="primary wide" style={{ marginTop: 16 }} disabled={!valid || saving} onClick={() => void onCreate({ customerName: customerName.trim(), customerPhone: customerPhone.trim(), address: address.trim(), destinationLat: point?.lat, destinationLng: point?.lng, notes: notes.trim() || undefined, items })}>{saving ? "Criando…" : "Criar pedido"}</button>
  </div></div>;
}

function Checkout({ order, onCancel, onConfirm }: { order: Order; onCancel: () => void; onConfirm: (checkout: SaleCheckout) => Promise<boolean> }) {
  const total = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [payments, setPayments] = useState([{ method: "Pix", amount: "", receivedAmount: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setSaving(true); setError("");
    const ok = await onConfirm(serializeCheckout(payments, discount, discountReason, total));
    setSaving(false); if (!ok) setError("Não foi possível concluir o pagamento.");
  };

  return <div className="modal-bg"><div className="modal">
    <button className="modal-close" onClick={onCancel}><X /></button>
    <span className="modal-icon"><CircleDollarSign /></span>
    <h2>Cobrar entrega</h2>
    <p>Pedido de {order.customerName} — {money(total)}</p>
    {error && <div className="auth-error">{error}</div>}
    <PaymentComposer grossTotal={total} discount={discount} setDiscount={setDiscount} discountReason={discountReason} setDiscountReason={setDiscountReason} payments={payments} setPayments={setPayments} />
    <button className="primary wide" disabled={saving} onClick={() => void confirm()}>{saving ? "Concluindo…" : "Concluir entrega"}</button>
  </div></div>;
}
