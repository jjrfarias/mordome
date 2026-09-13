"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Minus, Plus, Search, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { MapPicker } from "@/components/operations/MapPicker";

type MenuProduct = { id: string; name: string; category: string; description: string | null; price: number };
type MenuData = { establishment: { name: string }; products: MenuProduct[] };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function groupByCategory(products: MenuProduct[]) {
  const groups = new Map<string, MenuProduct[]>();
  for (const product of products) groups.set(product.category, [...(groups.get(product.category) ?? []), product]);
  return [...groups.entries()];
}

export default function OnlineOrderPage() {
  const params = useParams<{ establishmentId: string }>();
  const [data, setData] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [step, setStep] = useState<"catalog" | "details" | "done">("catalog");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [orderId, setOrderId] = useState("");

  useEffect(() => { queueMicrotask(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/public/orders/${params.establishmentId}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Não foi possível carregar o cardápio.");
      setData(json);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o cardápio."); } finally { setLoading(false); }
  }); }, [params.establishmentId]);

  if (loading) return <div className="public-menu"><div className="empty"><span>Carregando cardápio…</span></div></div>;
  if (error) return <div className="public-menu"><div className="public-menu-header"><Image src="/clientes/betao/simbolo-compacto-v1.png" alt="" width={56} height={56} priority /><h1>Pedido indisponível</h1></div><div className="auth-error">{error}</div></div>;
  if (!data) return null;

  const items = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => { const product = data.products.find(candidate => candidate.id === productId)!; return { product, quantity }; });
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const visible = data.products.filter(product => product.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const grouped = groupByCategory(visible);
  const setQuantity = (productId: string, quantity: number) => setQuantities(current => ({ ...current, [productId]: Math.max(0, Math.min(99, quantity)) }));

  const submitOrder = async () => {
    setSubmitting(true); setSubmitError("");
    try {
      const response = await fetch(`/api/public/orders/${params.establishmentId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: customerName.trim(), customerPhone: customerPhone.trim(), address: address.trim(), destinationLat: point?.lat, destinationLng: point?.lng, notes: notes.trim() || undefined, items: items.map(item => ({ productId: item.product.id, quantity: item.quantity })) }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Não foi possível enviar o pedido.");
      setOrderId(json.orderId); setStep("done");
    } catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "Não foi possível enviar o pedido."); } finally { setSubmitting(false); }
  };

  if (step === "done") return <div className="public-menu">
    <div className="public-menu-header"><Image src="/clientes/betao/simbolo-compacto-v1.png" alt="" width={56} height={56} priority /><span className="section-kicker">PEDIDO ONLINE</span><h1>{data.establishment.name}</h1></div>
    <div className="big-empty" style={{ background: "var(--paper)" }}><CheckCircle2 style={{ color: "#3e9a70" }} /><h2>Pedido recebido!</h2><p>Nº {orderId.slice(-6).toUpperCase()} · Em breve a equipe confirma e inicia o preparo.</p></div>
    <footer className="public-menu-footer">Mordomê <em>by JCS</em></footer>
  </div>;

  return <div className="public-menu" style={{ paddingBottom: items.length > 0 ? 110 : 60 }}>
    <div className="public-menu-header">
      <Image src="/clientes/betao/simbolo-compacto-v1.png" alt="" width={56} height={56} priority />
      <span className="section-kicker">PEDIDO ONLINE</span>
      <h1>{data.establishment.name}</h1>
      {step === "catalog" && <div className="search"><Search /><input placeholder="Buscar produto..." value={query} onChange={event => setQuery(event.target.value)} /></div>}
    </div>

    {step === "catalog" && (data.products.length === 0 ? <div className="big-empty"><UtensilsCrossed /><h2>Pedidos indisponíveis</h2><p>Nenhum produto disponível para pedido online no momento.</p></div> : <div className="public-menu-groups">
      {grouped.map(([category, products]) => <section className="public-menu-category" key={category}>
        <h2>{category}</h2>
        {products.map(product => <article className="public-menu-item" key={product.id}>
          <div><b>{product.name}</b>{product.description && <p>{product.description}</p>}<p style={{ color: "var(--green)", fontWeight: 700, marginTop: 4 }}>{money(product.price)}</p></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="icon-button" style={{ width: 30, height: 30 }} disabled={!quantities[product.id]} onClick={() => setQuantity(product.id, (quantities[product.id] ?? 0) - 1)}><Minus style={{ width: 14 }} /></button>
            <strong style={{ minWidth: 18, textAlign: "center" }}>{quantities[product.id] ?? 0}</strong>
            <button type="button" className="icon-button" style={{ width: 30, height: 30 }} onClick={() => setQuantity(product.id, (quantities[product.id] ?? 0) + 1)}><Plus style={{ width: 14 }} /></button>
          </div>
        </article>)}
      </section>)}
      {visible.length === 0 && <div className="empty"><span>Nenhum produto encontrado para essa busca.</span></div>}
    </div>)}

    {step === "details" && <div className="public-menu-groups">
      <section className="public-menu-category">
        <h2>Seus dados</h2>
        <label className="field"><span>Nome</span><input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Seu nome" /></label>
        <label className="field"><span>Telefone</span><input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="(00) 00000-0000" /></label>
        <label className="field"><span>Endereço de entrega</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder="Rua, número, bairro" /></label>
        <label className="field"><span>Observações</span><input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Opcional" /></label>
        <div style={{ marginTop: 10 }}><MapPicker value={point} onChange={setPoint} /></div>
      </section>
      <section className="public-menu-category">
        <h2>Resumo</h2>
        {items.map(item => <article className="public-menu-item" key={item.product.id}><div><b>{item.quantity}x {item.product.name}</b></div><strong>{money(item.product.price * item.quantity)}</strong></article>)}
        <article className="public-menu-item"><div><b>Total</b></div><strong>{money(total)}</strong></article>
      </section>
      {submitError && <div className="auth-error">{submitError}</div>}
      <button className="primary wide" disabled={!customerName.trim() || customerPhone.trim().length < 8 || !address.trim() || submitting} onClick={() => void submitOrder()}>{submitting ? "Enviando…" : "Confirmar pedido"}</button>
      <button className="secondary wide" onClick={() => setStep("catalog")}>Voltar ao cardápio</button>
    </div>}

    {step === "catalog" && items.length > 0 && <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "var(--paper)", borderTop: "1px solid var(--line)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, maxWidth: 640, margin: "0 auto" }}>
      <span style={{ fontSize: 12 }}><ShoppingBag style={{ width: 14, verticalAlign: "-2px", marginRight: 4 }} />{items.reduce((sum, item) => sum + item.quantity, 0)} itens · <b>{money(total)}</b></span>
      <button className="primary" onClick={() => setStep("details")}>Continuar</button>
    </div>}

    <footer className="public-menu-footer">Mordomê <em>by JCS</em> · <Link href={`/cardapio/${params.establishmentId}`} style={{ color: "inherit" }}>Ver cardápio completo</Link></footer>
  </div>;
}
