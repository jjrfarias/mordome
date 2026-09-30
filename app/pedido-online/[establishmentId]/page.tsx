"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Minus, Plus, Search, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { IngredientPicker, productHasIngredientChoices } from "@/components/operations/IngredientPicker";
import type { IngredientGroup, SelectedIngredientOption } from "@/lib/domain";
import { areaNeighborhoods, findDeliveryAreaByNeighborhood } from "@/lib/delivery-area-match";
import { Brand } from "@/components/ui";

type MenuProduct = { id: string; name: string; category: string; description: string | null; price: number; imageUrl: string | null; ingredientGroups?: IngredientGroup[] };
type HighlightProduct = { id: string; name: string; price: number; imageUrl: string | null };
type DeliveryAreaOption = { id: string; name: string; deliveryFee: number; neighborhoods: string | null };
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
  const [postalCode, setPostalCode] = useState("");
  const [street, setStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [lookingUpPostalCode, setLookingUpPostalCode] = useState(false);
  const [postalCodeError, setPostalCodeError] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryAreaId, setDeliveryAreaId] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [orderId, setOrderId] = useState("");
  const requestIdRef = useRef(crypto.randomUUID());
  const postalLookupRef = useRef(0);

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
  if (error) return <div className="public-menu"><div className="public-menu-header"><Brand compact /><h1>Pedido indisponível</h1></div><div className="auth-error">{error}</div></div>;
  if (!data) return null;

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const selectedArea = data.deliveryAreas.find(area => area.id === deliveryAreaId);
  const requiresDeliveryArea = data.deliveryAreas.length > 0;
  const automaticCoverage = data.deliveryAreas.some(area => areaNeighborhoods(area.neighborhoods).length > 0);
  const deliveryFee = selectedArea?.deliveryFee ?? 0;
  const total = subtotal + deliveryFee;
  const visible = data.products.filter(product => product.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const grouped = groupByCategory(visible);
  const address = [street && `${street}, ${addressNumber}`, complement, neighborhood, city && `${city}/${state}`, postalCode && `CEP ${postalCode}`].filter(Boolean).join(" · ");

  const lookupPostalCode = async (rawValue: string) => {
    const lookupId = ++postalLookupRef.current;
    const digits = rawValue.replace(/\D/g, "");
    setPostalCode(digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5, 8)}` : digits);
    setPostalCodeError("");
    setStreet(""); setNeighborhood(""); setCity(""); setState("");
    setPoint(null); setDeliveryAreaId(""); setLookingUpPostalCode(false);
    if (digits.length !== 8) return;
    setLookingUpPostalCode(true);
    try {
      const response = await fetch(`/api/public/postal-code/${digits}`);
      const result = await response.json().catch(() => ({}));
      if (lookupId !== postalLookupRef.current) return;
      if (!response.ok) throw new Error(result.error ?? "CEP não encontrado.");
      setStreet(result.street ?? ""); setNeighborhood(result.neighborhood ?? ""); setCity(result.city ?? ""); setState(result.state ?? "");
      if (result.latitude !== null && result.longitude !== null) setPoint({ lat: result.latitude, lng: result.longitude });
      const area = findDeliveryAreaByNeighborhood(data.deliveryAreas, result.neighborhood ?? "");
      setDeliveryAreaId(area?.id ?? "");
      if (automaticCoverage && !area) setPostalCodeError("Ainda não entregamos no bairro encontrado para este CEP.");
    } catch (cause) { if (lookupId === postalLookupRef.current) setPostalCodeError(cause instanceof Error ? cause.message : "Não foi possível consultar o CEP."); }
    finally { if (lookupId === postalLookupRef.current) setLookingUpPostalCode(false); }
  };

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
      const response = await fetch(`/api/public/orders/${params.establishmentId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: requestIdRef.current, customerName: customerName.trim(), customerPhone: customerPhone.trim(), address, postalCode, neighborhood, destinationLat: point?.lat, destinationLng: point?.lng, notes: notes.trim() || undefined, deliveryAreaId: deliveryAreaId || undefined, items: cart.map(line => ({ productId: line.product.id, quantity: line.quantity, selectedOptions: line.optionSelections?.length ? line.optionSelections : undefined })) }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Não foi possível enviar o pedido.");
      setOrderId(json.orderId); setStep("done");
    } catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "Não foi possível enviar o pedido."); } finally { setSubmitting(false); }
  };

  if (step === "done") return <div className="public-menu">
    <div className="public-menu-header"><Brand compact /><span className="section-kicker">PEDIDO ONLINE</span><h1>{data.establishment.name}</h1></div>
    <div className="big-empty" style={{ background: "var(--paper)" }}><CheckCircle2 style={{ color: "#3e9a70" }} /><h2>Pedido recebido!</h2><p>Nº {orderId.slice(-6).toUpperCase()} · A equipe vai confirmar seu pedido{data.deliveryAreas.length === 0 ? " e a taxa de entrega" : ""}.</p></div>
    <footer className="public-menu-footer">Mordomê <em>by JCS</em></footer>
  </div>;

  const highlight = data.establishment.highlightProduct;
  const highlightFullProduct = highlight ? data.products.find(product => product.id === highlight.id) : undefined;
  const showHighlight = Boolean(highlight && highlightFullProduct && data.products.length > 1);

  return <div className="public-menu" style={{ paddingBottom: cart.length > 0 ? 110 : 60 }}>
    {data.establishment.bannerUrl && step === "catalog" && <div className="public-menu-banner"><img src={data.establishment.bannerUrl} alt="" /></div>}
    <div className={`public-menu-header${data.establishment.bannerUrl ? " with-banner" : ""}`}>
      {data.establishment.logoUrl ? <img src={data.establishment.logoUrl} alt="" width={56} height={56} className="public-menu-logo" /> : <Brand compact />}
      <div className="public-menu-heading">
        <span className="section-kicker">PEDIDO ONLINE</span>
        <h1>{data.establishment.name}</h1>
        <p className="public-menu-subtitle">Peça online · Entrega</p>
      </div>
    </div>
    {step === "catalog" && <div className="search public-menu-search"><Search /><input placeholder="Buscar produto..." value={query} onChange={event => setQuery(event.target.value)} /></div>}

    {step === "catalog" && showHighlight && highlight && <section className="public-menu-highlight" onClick={() => highlightFullProduct ? addProduct(highlightFullProduct) : undefined} role="button" tabIndex={0}>
      <div className="public-menu-highlight-photo">{highlight.imageUrl ? <img src={highlight.imageUrl} alt="" /> : <UtensilsCrossed />}</div>
      <div className="public-menu-highlight-body"><span>{data.establishment.highlightHeadline || "Destaque"}</span><b>{highlight.name}</b><strong>{money(highlight.price)}</strong></div>
      <Plus />
    </section>}

    {step === "catalog" && (data.products.length === 0 ? <div className="big-empty"><UtensilsCrossed /><h2>Pedidos indisponíveis</h2><p>Nenhum produto disponível para pedido online no momento.</p></div> : <>
      {grouped.length > 1 && <nav className="public-menu-tabs">{grouped.map(([category]) => <button key={category} type="button" onClick={() => document.getElementById(`categoria-${category}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{category}</button>)}</nav>}
      <div className="public-menu-layout">
        <div className="public-menu-groups">
          {grouped.map(([category, products]) => <section className="public-menu-category" key={category} id={`categoria-${category}`}>
            <div className="public-menu-category-heading"><div><span>Cardápio</span><h2>{category}</h2></div><small>{products.length} {products.length === 1 ? "item" : "itens"}</small></div>
            <div className="public-menu-product-grid">{products.map(product => {
              const hasChoices = productHasIngredientChoices(product);
              const plainLine = cart.find(line => line.product.id === product.id && !line.selectedOptions?.length);
              return <article className="public-menu-item" key={product.id}>
                <div className="public-menu-item-photo">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <UtensilsCrossed />}</div>
                <div className="public-menu-item-body"><b>{product.name}</b>{product.description && <p>{product.description}</p>}<strong className="public-menu-price">{money(product.price)}</strong></div>
                {hasChoices ? <button type="button" className="public-menu-add" onClick={() => setPickerProduct(product)} aria-label={`Adicionar ${product.name}`}><Plus /></button> : <div className={`public-menu-stepper${plainLine ? " active" : ""}`}>
                  {plainLine && <><button type="button" onClick={() => changeLine(plainLine.cartLineId, -1)} aria-label="Remover uma unidade"><Minus /></button><strong>{plainLine.quantity}</strong></>}
                  <button type="button" onClick={() => addPlain(product)} aria-label={`Adicionar ${product.name}`}><Plus /></button>
                </div>}
              </article>;
            })}</div>
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
        <div className="public-address-grid">
          <label className="field public-address-cep"><span>CEP</span><input value={postalCode} onChange={event => void lookupPostalCode(event.target.value)} inputMode="numeric" maxLength={9} placeholder="00000-000" />{lookingUpPostalCode && <small>Buscando endereço…</small>}</label>
          <label className="field public-address-street"><span>Rua</span><input value={street} onChange={event => setStreet(event.target.value)} placeholder="Rua ou avenida" /></label>
          <label className="field public-address-number"><span>Número</span><input value={addressNumber} onChange={event => setAddressNumber(event.target.value)} inputMode="numeric" placeholder="Nº" /></label>
          <label className="field"><span>Complemento</span><input value={complement} onChange={event => setComplement(event.target.value)} placeholder="Apto, bloco (opcional)" /></label>
          <label className="field"><span>Bairro</span><input value={neighborhood} onChange={event => { const value = event.target.value; setNeighborhood(value); const area = findDeliveryAreaByNeighborhood(data.deliveryAreas, value); setDeliveryAreaId(area?.id ?? ""); }} placeholder="Bairro" /></label>
          <label className="field"><span>Cidade/UF</span><input value={city && state ? `${city}/${state}` : city} readOnly placeholder="Preenchido pelo CEP" /></label>
        </div>
        {postalCodeError && <div className="auth-error">{postalCodeError}</div>}
        {data.deliveryAreas.length > 0 && !automaticCoverage && <label className="field"><span>Área de entrega</span><select value={deliveryAreaId} onChange={event => setDeliveryAreaId(event.target.value)}>
          <option value="">Selecione sua região</option>
          {data.deliveryAreas.map(area => <option key={area.id} value={area.id}>{area.name} · {money(area.deliveryFee)}</option>)}
        </select><small style={{ color: "var(--muted)" }}>Necessário para calcular a taxa e concluir o pedido.</small></label>}
        {selectedArea && automaticCoverage && <div className="public-delivery-match"><span>Região atendida</span><b>{selectedArea.name}</b><strong>{money(selectedArea.deliveryFee)}</strong></div>}
        {data.deliveryAreas.length === 0 && <div className="auth-error" style={{ background: "#fff8e8", color: "#6d5114", borderColor: "#ead59a" }}>A taxa de entrega será confirmada pela equipe antes da entrega.</div>}
        <label className="field"><span>Observações</span><input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Opcional" /></label>
      </section>
      <section className="public-menu-category">
        <h2>Resumo</h2>
        {cart.map(line => <article className="public-menu-item" key={line.cartLineId}><div><b>{line.quantity}x {line.product.name}</b>{line.selectedOptions?.length ? <small style={{ display: "block", color: "var(--muted)" }}>{line.selectedOptions.map(option => option.optionName).join(", ")}</small> : null}</div><strong>{money(line.unitPrice * line.quantity)}</strong></article>)}
        <article className="public-menu-item"><div><b>Subtotal</b></div><strong>{money(subtotal)}</strong></article>
        <article className="public-menu-item"><div><b>Taxa de entrega</b></div><strong>{selectedArea ? money(deliveryFee) : requiresDeliveryArea ? "Selecione a região" : "A confirmar"}</strong></article>
        <article className="public-menu-item"><div><b>{selectedArea ? "Total" : "Subtotal, sem entrega"}</b></div><strong>{money(total)}</strong></article>
      </section>
      {submitError && <div className="auth-error">{submitError}</div>}
      <button className="primary wide" disabled={!customerName.trim() || customerPhone.trim().length < 8 || postalCode.replace(/\D/g, "").length !== 8 || !street.trim() || !addressNumber.trim() || !neighborhood.trim() || Boolean(postalCodeError) || (requiresDeliveryArea && !deliveryAreaId) || submitting} onClick={() => void submitOrder()}>{submitting ? "Enviando…" : requiresDeliveryArea ? "Confirmar pedido" : "Enviar para confirmação"}</button>
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
