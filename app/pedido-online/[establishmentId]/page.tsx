"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Minus, Plus, Search, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { MapPicker } from "@/components/operations/MapPicker";
import { IngredientPicker, productHasIngredientChoices } from "@/components/operations/IngredientPicker";
import type { IngredientGroup, SelectedIngredientOption } from "@/lib/domain";

type MenuProduct = { id: string; name: string; category: string; description: string | null; price: number; imageUrl: string | null; ingredientGroups?: IngredientGroup[] };
type HighlightProduct = { id: string; name: string; price: number; imageUrl: string | null };
type DeliveryAreaOption = { id: string; name: string; deliveryFee: number };
type MenuData = { establishment: { name: string; logoUrl: string | null; bannerUrl: string | null; highlightHeadline: string | null; highlightProduct: HighlightProduct | null }; products: MenuProduct[]; deliveryAreas: DeliveryAreaOption[] };
type CartLine = { cartLineId: string; product: MenuProduct; quantity: number; unitPrice: number; selectedOptions?: SelectedIngredientOption[]; optionSelections?: { groupId: string; optionIds: string[] }[] };

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
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pickerProduct, setPickerProduct] = useState<MenuProduct | null>(null);
  const [step, setStep] = useState<"catalog" | "details" | "done">("catalog");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryAreaId, setDeliveryAreaId] = useState("");
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

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const selectedArea = data.deliveryAreas.find(area => area.id === deliveryAreaId);
  const deliveryFee = selectedArea?.deliveryFee ?? 0;
  const total = subtotal + deliveryFee;
  const visible = data.products.filter(product => product.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const grouped = groupByCategory(visible);

  const addPlain = (product: MenuProduct) => setCart(current => {
    const found = current.find(line => line.product.id === product.id && !line.selectedOptions?.length);
    return found ? current.map(line => line === found ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { cartLineId: crypto.randomUUID(), product, quantity: 1, unitPrice: product.price }];
  });
  const addWithOptions = (product: MenuProduct, unitPrice: number, selectedOptions: SelectedIngredientOption[], optionSelections: { groupId: string; optionIds: string[] }[]) => setCart(current => [...current, { cartLineId: crypto.randomUUID(), product, quantity: 1, unitPrice, selectedOptions, optionSelections }]);
  const addProduct = (product: MenuProduct) => { if (productHasIngredientChoices(product)) { setPickerProduct(product); return; } addPlain(product); };
  const changeLine = (cartLineId: string, delta: number) => setCart(current => current.map(line => line.cartLineId === cartLineId ? { ...line, quantity: line.quantity + delta } : line).filter(line => line.quantity > 0));

  const submitOrder = async () => {
    setSubmitting(true); setSubmitError("");
    try {
      const response = await fetch(`/api/public/orders/${params.establishmentId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: customerName.trim(), customerPhone: customerPhone.trim(), address: address.trim(), destinationLat: point?.lat, destinationLng: point?.lng, notes: notes.trim() || undefined, deliveryAreaId: deliveryAreaId || undefined, items: cart.map(line => ({ productId: line.product.id, quantity: line.quantity, selectedOptions: line.optionSelections?.length ? line.optionSelections : undefined })) }) });
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

  const highlight = data.establishment.highlightProduct;
  const highlightFullProduct = highlight ? data.products.find(product => product.id === highlight.id) : undefined;

  return <div className="public-menu" style={{ paddingBottom: cart.length > 0 ? 110 : 60 }}>
    {data.establishment.bannerUrl && step === "catalog" && <div className="public-menu-banner"><img src={data.establishment.bannerUrl} alt="" /></div>}
    <div className={`public-menu-header${data.establishment.bannerUrl ? " with-banner" : ""}`}>
      {data.establishment.logoUrl ? <img src={data.establishment.logoUrl} alt="" width={56} height={56} className="public-menu-logo" /> : <Image src="/clientes/betao/simbolo-compacto-v1.png" alt="" width={56} height={56} priority />}
      <div className="public-menu-heading">
        <span className="section-kicker">PEDIDO ONLINE</span>
        <h1>{data.establishment.name}</h1>
      </div>
    </div>
    {step === "catalog" && <div className="search public-menu-search"><Search /><input placeholder="Buscar produto..." value={query} onChange={event => setQuery(event.target.value)} /></div>}

    {step === "catalog" && highlight && <section className="public-menu-highlight" onClick={() => highlightFullProduct ? addProduct(highlightFullProduct) : undefined} role="button" tabIndex={0}>
      <div className="public-menu-highlight-photo">{highlight.imageUrl ? <img src={highlight.imageUrl} alt="" /> : <UtensilsCrossed />}</div>
      <div className="public-menu-highlight-body"><span>{data.establishment.highlightHeadline || "Destaque"}</span><b>{highlight.name}</b><strong>{money(highlight.price)}</strong></div>
      <Plus />
    </section>}

    {step === "catalog" && (data.products.length === 0 ? <div className="big-empty"><UtensilsCrossed /><h2>Pedidos indisponíveis</h2><p>Nenhum produto disponível para pedido online no momento.</p></div> : <>
      {grouped.length > 1 && <nav className="public-menu-tabs">{grouped.map(([category]) => <button key={category} type="button" onClick={() => document.getElementById(`categoria-${category}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{category}</button>)}</nav>}
      <div className="public-menu-layout">
        <div className="public-menu-groups">
          {grouped.map(([category, products]) => <section className="public-menu-category" key={category} id={`categoria-${category}`}>
            <h2>{category}</h2>
            {products.map(product => {
              const hasChoices = productHasIngredientChoices(product);
              const plainLine = cart.find(line => line.product.id === product.id && !line.selectedOptions?.length);
              return <article className="public-menu-item" key={product.id}>
                <div className="public-menu-item-photo">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <UtensilsCrossed />}</div>
                <div className="public-menu-item-body"><b>{product.name}</b>{product.description && <p>{product.description}</p>}<p style={{ color: "var(--green)", fontWeight: 700, marginTop: 4 }}>{money(product.price)}</p></div>
                {hasChoices ? <button type="button" className="icon-button" style={{ width: 30, height: 30 }} onClick={() => setPickerProduct(product)}><Plus style={{ width: 14 }} /></button> : <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" className="icon-button" style={{ width: 30, height: 30 }} disabled={!plainLine} onClick={() => plainLine && changeLine(plainLine.cartLineId, -1)}><Minus style={{ width: 14 }} /></button>
                  <strong style={{ minWidth: 18, textAlign: "center" }}>{plainLine?.quantity ?? 0}</strong>
                  <button type="button" className="icon-button" style={{ width: 30, height: 30 }} onClick={() => addPlain(product)}><Plus style={{ width: 14 }} /></button>
                </div>}
              </article>;
            })}
          </section>)}
          {visible.length === 0 && <div className="empty"><span>Nenhum produto encontrado para essa busca.</span></div>}
        </div>
        <aside className="public-menu-sidebar">
          <h2>Sua sacola</h2>
          {cart.length === 0 ? <p style={{ fontSize: 12, color: "var(--muted)" }}>Toque em um produto para começar.</p> : <>
            {cart.map(line => <article className="public-menu-item public-menu-cart-item" key={line.cartLineId}>
              <div><b>{line.product.name}</b>{line.selectedOptions?.length ? <small style={{ display: "block", color: "var(--muted)", marginTop: 2 }}>{line.selectedOptions.map(option => option.optionName).join(", ")}</small> : null}<small style={{ display: "block", color: "var(--muted)", marginTop: 2 }}>{money(line.unitPrice)}</small></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button type="button" className="icon-button" style={{ width: 26, height: 26 }} onClick={() => changeLine(line.cartLineId, -1)}><Minus style={{ width: 12 }} /></button>
                <strong style={{ minWidth: 14, textAlign: "center" }}>{line.quantity}</strong>
                <button type="button" className="icon-button" style={{ width: 26, height: 26 }} onClick={() => changeLine(line.cartLineId, 1)}><Plus style={{ width: 12 }} /></button>
              </div>
            </article>)}
            <article className="public-menu-item"><div><b>Subtotal</b></div><strong>{money(subtotal)}</strong></article>
            <button className="primary wide" style={{ marginTop: 14 }} onClick={() => setStep("details")}>Continuar</button>
          </>}
        </aside>
      </div>
    </>)}

    {step === "details" && <div className="public-menu-groups">
      <section className="public-menu-category">
        <h2>Seus dados</h2>
        <label className="field"><span>Nome</span><input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Seu nome" /></label>
        <label className="field"><span>Telefone</span><input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="(00) 00000-0000" /></label>
        <label className="field"><span>Endereço de entrega</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder="Rua, número, bairro" /></label>
        {data.deliveryAreas.length > 0 && <label className="field"><span>Área de entrega</span><select value={deliveryAreaId} onChange={event => setDeliveryAreaId(event.target.value)}>
          <option value="">Selecione sua região</option>
          {data.deliveryAreas.map(area => <option key={area.id} value={area.id}>{area.name} · {money(area.deliveryFee)}</option>)}
        </select></label>}
        <label className="field"><span>Observações</span><input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Opcional" /></label>
        <div style={{ marginTop: 10 }}><MapPicker value={point} onChange={setPoint} /></div>
      </section>
      <section className="public-menu-category">
        <h2>Resumo</h2>
        {cart.map(line => <article className="public-menu-item" key={line.cartLineId}><div><b>{line.quantity}x {line.product.name}</b>{line.selectedOptions?.length ? <small style={{ display: "block", color: "var(--muted)" }}>{line.selectedOptions.map(option => option.optionName).join(", ")}</small> : null}</div><strong>{money(line.unitPrice * line.quantity)}</strong></article>)}
        <article className="public-menu-item"><div><b>Subtotal</b></div><strong>{money(subtotal)}</strong></article>
        <article className="public-menu-item"><div><b>Taxa de entrega</b></div><strong>{selectedArea ? money(deliveryFee) : "A calcular"}</strong></article>
        <article className="public-menu-item"><div><b>Total</b></div><strong>{money(total)}</strong></article>
      </section>
      {submitError && <div className="auth-error">{submitError}</div>}
      <button className="primary wide" disabled={!customerName.trim() || customerPhone.trim().length < 8 || !address.trim() || submitting} onClick={() => void submitOrder()}>{submitting ? "Enviando…" : "Confirmar pedido"}</button>
      <button className="secondary wide" onClick={() => setStep("catalog")}>Voltar ao cardápio</button>
    </div>}

    {step === "catalog" && cart.length > 0 && <div className="public-menu-cartbar" style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "var(--paper)", borderTop: "1px solid var(--line)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, maxWidth: 640, margin: "0 auto" }}>
      <span style={{ fontSize: 12 }}><ShoppingBag style={{ width: 14, verticalAlign: "-2px", marginRight: 4 }} />{cart.reduce((sum, line) => sum + line.quantity, 0)} itens · <b>{money(total)}</b></span>
      <button className="primary" onClick={() => setStep("details")}>Continuar</button>
    </div>}

    {pickerProduct && <IngredientPicker product={pickerProduct} onClose={() => setPickerProduct(null)} onConfirm={(unitPrice, selectedOptions, optionSelections) => { addWithOptions(pickerProduct, unitPrice, selectedOptions, optionSelections); setPickerProduct(null); }} />}

    <footer className="public-menu-footer">Mordomê <em>by JCS</em> · <Link href={`/cardapio/${params.establishmentId}`} style={{ color: "inherit" }}>Ver cardápio completo</Link></footer>
  </div>;
}
