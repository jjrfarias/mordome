"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Package, Phone } from "lucide-react";
import { money } from "@/lib/domain";
import { DeliveryMap } from "./DeliveryMap";

type OrderItem = { id: string; productName: string; quantity: number; unitPrice: number };
type Order = { id: string; customerName: string; customerPhone: string; address: string; destinationLat: number | null; destinationLng: number | null; status: "RECEIVED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED"; items: OrderItem[] };

const statusLabels: Record<Order["status"], string> = { RECEIVED: "Recebido", PREPARING: "Aguardando você sair para entrega", OUT_FOR_DELIVERY: "Em rota", DELIVERED: "Entregue", CANCELLED: "Cancelado" };

export function CourierApp() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [myPosition, setMyPosition] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPingRef = useRef(0);

  const load = async () => {
    try {
      const response = await fetch("/api/operations/courier", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar suas entregas.");
      setOrders(data.orders ?? []); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar suas entregas."); } finally { setLoading(false); }
  };

  useEffect(() => { queueMicrotask(() => { void load(); }); const interval = setInterval(() => void load(), 15000); return () => clearInterval(interval); }, []);

  useEffect(() => {
    if (!sharing) { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; return; }
    if (!navigator.geolocation) { setError("Este navegador não permite compartilhar localização."); setSharing(false); return; }
    watchIdRef.current = navigator.geolocation.watchPosition(position => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      setMyPosition(point); setError("");
      const now = Date.now();
      if (now - lastPingRef.current > 10000) {
        lastPingRef.current = now;
        void fetch("/api/operations/courier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PING", ...point }) });
      }
    }, () => setError("Não foi possível obter sua localização. Verifique a permissão do navegador."), { enableHighAccuracy: true, maximumAge: 5000 });
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, [sharing]);

  const activeOrders = orders.filter(order => order.status === "OUT_FOR_DELIVERY");
  const upcomingOrders = orders.filter(order => order.status !== "OUT_FOR_DELIVERY");
  const destinations = activeOrders.filter(order => order.destinationLat !== null && order.destinationLng !== null).map(order => ({ orderId: order.id, lat: order.destinationLat!, lng: order.destinationLng!, label: order.customerName }));
  const couriers = myPosition ? [{ courierId: "me", lat: myPosition.lat, lng: myPosition.lng, label: "Você" }] : [];
  const routes = myPosition && destinations[0] ? [{ courierId: "me", destination: { lat: destinations[0].lat, lng: destinations[0].lng }, label: destinations[0].label }] : [];

  return <div className="page-content">
    <div className="hero-row"><div><span className="section-kicker">Minhas entregas</span><p>Suas rotas atribuídas e compartilhamento de localização.</p></div>
      <button className={sharing ? "secondary" : "primary"} onClick={() => setSharing(current => !current)}><Navigation /> {sharing ? "Parar de compartilhar" : "Estou em rota"}</button>
    </div>
    {error && <div className="auth-error">{error}</div>}
    {sharing && <div className="demo-note"><Navigation /><div><b>Compartilhando localização</b><span>A equipe vê sua posição enquanto esta tela estiver aberta e a opção ativa.</span></div></div>}

    <DeliveryMap destinations={destinations} couriers={couriers} routes={routes} height={260} />

    {loading ? <div className="empty"><span>Carregando…</span></div> : orders.length === 0 ? <div className="big-empty"><Package /><h2>Nenhuma entrega no momento</h2><p>Quando um pedido for atribuído a você, ele aparece aqui.</p></div> : <div className="kds-grid">
      {[...activeOrders, ...upcomingOrders].map(order => <article key={order.id} className={`kds-card ${order.status === "OUT_FOR_DELIVERY" ? "pronto" : "em-preparo"}`}>
        <div className="kds-head"><div><span>{statusLabels[order.status]}</span><b>{order.customerName}</b></div><a href={`tel:${order.customerPhone}`} className="icon-button" aria-label="Ligar"><Phone /></a></div>
        <div className="kds-items">
          <div style={{ marginBottom: 10, fontSize: 12, display: "flex", gap: 6, alignItems: "flex-start" }}><MapPin style={{ width: 14, flex: "0 0 auto", marginTop: 1 }} />{order.address}</div>
          {order.items.map(item => <div key={item.id}><span>{item.quantity}x</span><span>{item.productName}</span></div>)}
        </div>
        <div className="kds-foot"><span>{money(order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))}</span>
          {order.destinationLat !== null && <a className="secondary" style={{ textDecoration: "none", fontSize: 10 }} target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/directions?to=${order.destinationLat},${order.destinationLng}`}>Abrir rota</a>}
        </div>
      </article>)}
    </div>}
  </div>;
}
