"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { RotateCcw, SearchX, UtensilsCrossed } from "lucide-react";
import { addToCart, cartStorageKey, cartSubtotalCents, cartUnits, changeLineQuantity, evaluateCoupon, favoritesStorageKey, orderTotals, parseStoredCart, priceSelection, productRequiresChoice, reconcileCart, restoreLine, serializeCart, type CartLine, type PricedSelection } from "@/lib/storefront/cart";
import { availableQuickFilters, emptyFilters, hasActiveRefinements, selectProducts, type CatalogFilters } from "@/lib/storefront/catalog";
import { parseStoredAddress, quoteDelivery } from "@/lib/storefront/delivery";
import { mapLiveStorefront, type PublicOrderMenuResponse } from "@/lib/storefront/live-adapter";
import { formatAddressForOrder, type DeliveryAddress, type StorefrontData, type StorefrontProduct, type StorefrontTarget } from "@/lib/storefront/model";
import { CartPanel } from "./Cart";
import { CategoryNavigation } from "./CategoryNavigation";
import { Checkout, type CheckoutForm, type CheckoutResult } from "./Checkout";
import { DeliveryAddressDialog } from "./DeliveryAddress";
import { Header, type NavItem } from "./Header";
import { HeroBanner } from "./HeroBanner";
import { InfoSections } from "./InfoSections";
import { MobileCartBar } from "./MobileCartBar";
import { ProductCard } from "./ProductCard";
import { ProductDetails } from "./ProductDetails";
import { FilterDialog, ProductFilters } from "./ProductFilters";
import { Benefits, LoyaltyDialog, PromoBanners } from "./PromoBanners";
import { Dialog, ToastRegion, cx, useToasts } from "./primitives";
import styles from "./storefront.module.css";

export type StorefrontSource = { kind: "live"; establishmentId: string } | { kind: "demo" };

class StorefrontRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function loadStorefront(source: StorefrontSource): Promise<StorefrontData> {
  // Os dados demonstrativos ficam num módulo separado, carregado só pela rota de demonstração.
  if (source.kind === "demo") return (await import("@/lib/storefront/demo-data")).demoStorefront;
  const response = await fetch(`/api/public/orders/${encodeURIComponent(source.establishmentId)}`, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new StorefrontRequestError(typeof json.error === "string" ? json.error : "Não foi possível carregar o cardápio.", response.status);
  return mapLiveStorefront(source.establishmentId, json as PublicOrderMenuResponse);
}

// Armazenamento do navegador pode estar bloqueado (modo privado, política da empresa): a vitrine
// continua funcionando, só sem persistência.
const storage = {
  get(kind: "local" | "session", key: string) { try { return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key); } catch { return null; } },
  set(kind: "local" | "session", key: string, value: string | null) { try { const target = kind === "local" ? window.localStorage : window.sessionStorage; if (value === null) target.removeItem(key); else target.setItem(key, value); } catch { /* sem persistência */ } },
};
const addressStorageKey = (storeKey: string) => `mordome:pedido-online:endereco:v1:${storeKey}`;
const newId = () => crypto.randomUUID();
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });

export function StorefrontPage({ source }: { source: StorefrontSource }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string; notFound: boolean } | { status: "ready"; data: StorefrontData }>({ status: "loading" });
  const [lines, setLines] = useState<CartLine[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [address, setAddress] = useState<DeliveryAddress | null>(null);
  const [filters, setFilters] = useState<CatalogFilters>(emptyFilters);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponError, setCouponError] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "filters" | "cart" | "checkout" | "loyalty">(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("inicio");
  const { toasts, push, dismiss } = useToasts();
  const hydrated = useRef(false);
  const linesRef = useRef<CartLine[]>([]);
  const requestId = useRef<string | null>(null);
  const sourceKey = source.kind === "demo" ? "demo" : source.establishmentId;

  useEffect(() => { linesRef.current = lines; requestId.current = null; }, [lines]);

  const applyData = useCallback((data: StorefrontData) => {
    let notices: string[];
    if (!hydrated.current) {
      const reconciled = reconcileCart(parseStoredCart(storage.get("local", cartStorageKey(data.storeKey))), data.products);
      setLines(reconciled.lines);
      notices = reconciled.notices;
      try { setFavorites(new Set((JSON.parse(storage.get("local", favoritesStorageKey(data.storeKey)) ?? "[]") as unknown[]).filter((id): id is string => typeof id === "string"))); } catch { setFavorites(new Set()); }
      setAddress(parseStoredAddress(storage.get("session", addressStorageKey(data.storeKey))));
      setFilters(current => ({ ...current, sort: availableQuickFilters(data.products).popular ? "popular" : "featured" }));
      hydrated.current = true;
    } else {
      // Recarga (ex.: após 409) ou resposta duplicada: revalida o carrinho ATUAL, nunca uma cópia
      // antiga — senão uma resposta atrasada apagaria itens recém-restaurados.
      notices = reconcileCart(linesRef.current, data.products).notices;
      setLines(current => reconcileCart(current, data.products).lines);
    }
    notices.forEach(message => push({ message, tone: "warning" }, 7000));
    setState({ status: "ready", data });
    // `push` muda a cada render; a reconciliação só precisa da versão atual quando os dados chegam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    loadStorefront(source).then(applyData).catch(cause => setState({ status: "error", message: cause instanceof Error ? cause.message : "Não foi possível carregar o cardápio.", notFound: cause instanceof StorefrontRequestError && cause.status === 404 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, applyData]);

  useEffect(() => { load(); }, [load]);

  const data = state.status === "ready" ? state.data : null;
  const storeKey = data?.storeKey;

  useEffect(() => { if (storeKey && hydrated.current) storage.set("local", cartStorageKey(storeKey), lines.length ? serializeCart(lines) : null); }, [lines, storeKey]);
  useEffect(() => { if (storeKey && hydrated.current) storage.set("local", favoritesStorageKey(storeKey), JSON.stringify([...favorites])); }, [favorites, storeKey]);
  useEffect(() => { if (storeKey && hydrated.current) storage.set("session", addressStorageKey(storeKey), address ? JSON.stringify(address) : null); }, [address, storeKey]);

  const nav: NavItem[] = useMemo(() => !data ? [] : [
    { id: "inicio", label: "Início" },
    { id: "cardapio", label: "Cardápio" },
    ...(data.about ? [{ id: "sobre", label: "Sobre nós" }] : []),
    ...(data.stores.length ? [{ id: "lojas", label: "Nossas lojas" }] : []),
    ...(data.loyalty ? [{ id: "fidelidade", label: "Fidelidade" }] : []),
    ...(data.establishment.phone || data.establishment.address ? [{ id: "contato", label: "Contato" }] : []),
  ], [data]);

  const navKey = nav.map(item => item.id).join(",");
  useEffect(() => {
    if (!navKey) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
      const first = navKey.split(",").find(id => visible.get(id));
      if (first) setActiveSection(first);
    }, { rootMargin: "-120px 0px -55% 0px" });
    navKey.split(",").forEach(id => { const element = document.getElementById(id); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [navKey]);

  const productsById = useMemo(() => new Map((data?.products ?? []).map(product => [product.id, product])), [data]);
  const quick = useMemo(() => availableQuickFilters(data?.products ?? []), [data]);
  const visibleProducts = useMemo(() => data ? selectProducts(data.products, data.categories, filters, favorites) : [], [data, filters, favorites]);

  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error" || !data) return <ErrorState message={state.status === "error" ? state.message : ""} notFound={state.status === "error" && state.notFound} onRetry={() => { setState({ status: "loading" }); load(); }} />;

  const isDemo = data.mode === "demo";
  const subtotalCents = cartSubtotalCents(lines);
  const couponEvaluation = couponCode && data.coupons ? evaluateCoupon(couponCode, data.coupons, subtotalCents) : null;
  const appliedCoupon = couponEvaluation?.ok ? { code: couponEvaluation.code, discountCents: couponEvaluation.discountCents } : null;
  const quote = quoteDelivery(data.deliveryAreas, address);
  const totals = orderTotals({ subtotalCents, discountCents: appliedCoupon?.discountCents ?? 0, deliveryFeeCents: quote.status === "known" ? quote.feeCents : null });
  const pickupTotals = orderTotals({ subtotalCents, discountCents: appliedCoupon?.discountCents ?? 0, deliveryFeeCents: 0 });
  const units = cartUnits(lines);
  const detailsProduct = detailsId ? productsById.get(detailsId) ?? null : null;
  const categoryName = (categoryId: string) => data.categories.find(category => category.id === categoryId)?.name ?? "";
  const advancedCount = (filters.favoritesOnly ? 1 : 0) + (filters.maxPriceCents !== null ? 1 : 0) + (["price-asc", "price-desc", "name"].includes(filters.sort) ? 1 : 0);

  const patchFilters = (patch: Partial<CatalogFilters>) => setFilters(current => ({ ...current, ...patch }));
  const resetFilters = () => setFilters({ ...emptyFilters, sort: quick.popular ? "popular" : "featured" });

  const toggleFavorite = (product: StorefrontProduct) => setFavorites(current => {
    const next = new Set(current);
    if (next.has(product.id)) next.delete(product.id); else next.add(product.id);
    return next;
  });

  const addPriced = (product: StorefrontProduct, priced: Extract<PricedSelection, { ok: true }>, quantity: number) => {
    setLines(current => addToCart(current, product, priced, quantity, newId));
    push({ message: `${quantity > 1 ? `${quantity}x ` : ""}${product.name} adicionado ao pedido.`, group: "added" }, 2500);
  };

  const quickAdd = (product: StorefrontProduct) => {
    if (productRequiresChoice(product)) { setDetailsId(product.id); return; }
    const priced = priceSelection(product, []);
    if (priced.ok) addPriced(product, priced, 1);
  };

  const changeLine = (lineId: string, delta: number) => {
    const result = changeLineQuantity(lines, lineId, delta);
    setLines(result.lines);
    if (result.removed) {
      const { line, index } = result.removed;
      push({ message: `${line.name} removido do pedido.`, action: { label: "Desfazer", run: () => setLines(current => restoreLine(current, line, index)) } });
    }
  };

  const clearCart = () => {
    const previous = lines;
    setLines([]);
    push({ message: "Pedido limpo.", action: { label: "Desfazer", run: () => setLines(current => current.length ? current : previous) } });
  };

  const applyCoupon = (code: string) => {
    if (!data.coupons) return;
    const result = evaluateCoupon(code, data.coupons, subtotalCents);
    if (result.ok) { setCouponCode(result.code); setCouponError(""); push({ message: `Cupom ${result.code} aplicado.` }, 2500); }
    else { setCouponCode(null); setCouponError(result.error); }
  };

  const goToTarget = (target: StorefrontTarget) => {
    if (target.kind === "product") { setDetailsId(target.productId); return; }
    if (target.kind === "category") patchFilters({ categoryId: target.categoryId, query: "" });
    scrollToId("cardapio");
  };

  const openCheckout = () => { setDialog("checkout"); };

  const submitOrder = async (form: CheckoutForm): Promise<CheckoutResult> => {
    if (isDemo) {
      await new Promise(resolve => setTimeout(resolve, 700));
      setLines([]); setCouponCode(null);
      return { kind: "demo" };
    }
    if (source.kind !== "live" || !address) throw new Error("Informe o endereço de entrega.");
    // Chave idempotente estável enquanto o carrinho não muda: um reenvio após falha de rede devolve
    // o mesmo pedido em vez de criar outro (DeliveryOrder @@unique[establishmentId, clientRequestId]).
    requestId.current ??= newId();
    const response = await fetch(`/api/public/orders/${encodeURIComponent(source.establishmentId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientRequestId: requestId.current,
        customerName: form.name,
        customerPhone: form.phone,
        address: formatAddressForOrder(address),
        postalCode: address.postalCode,
        neighborhood: address.neighborhood,
        destinationLat: address.latitude ?? undefined,
        destinationLng: address.longitude ?? undefined,
        notes: form.notes || undefined,
        deliveryAreaId: quote.status === "known" ? quote.area.id : undefined,
        items: lines.map(line => ({ productId: line.productId, quantity: line.quantity, selectedOptions: line.selections.length ? line.selections : undefined })),
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      // 409: produto ou preço mudou — recarrega o cardápio e revalida o carrinho antes de tentar de novo.
      if (response.status === 409) load();
      throw new Error(typeof json.error === "string" ? json.error : "Não foi possível enviar o pedido. Tente novamente.");
    }
    setLines([]);
    return { kind: "live", orderId: String(json.orderId ?? ""), feeToConfirm: quote.status === "confirm" };
  };

  const cartPanelProps = {
    lines, totals, quote, address,
    estimatedTime: data.estimatedDeliveryTime,
    couponsEnabled: data.coupons !== null,
    coupon: appliedCoupon,
    couponError: couponEvaluation && !couponEvaluation.ok ? couponEvaluation.error : couponError,
    sustainabilityNote: data.sustainabilityNote,
    isDemo,
    onChangeLine: changeLine,
    onClear: clearCart,
    onApplyCoupon: applyCoupon,
    onRemoveCoupon: () => { setCouponCode(null); setCouponError(""); },
    onEditAddress: () => setAddressOpen(true),
    onLoadSample: isDemo ? () => { void import("@/lib/storefront/demo-data").then(demo => { setLines(demo.demoSampleCart(newId)); setAddress(demo.demoSampleAddress); }); } : undefined,
  };

  const refined = hasActiveRefinements(filters);
  const sectionTitle = filters.query.trim() ? `Resultados para “${filters.query.trim()}”` : filters.categoryId ? categoryName(filters.categoryId) : "Destaques do cardápio";

  const themeStyle = { "--red": data.branding.primary, "--warm": data.branding.accent } as CSSProperties;

  return <div className={cx(styles.root, units > 0 && styles.rootWithBar)} style={themeStyle}>
    <a href="#cardapio" className={styles.skipLink}>Pular para o cardápio</a>
    {isDemo && <p className={styles.demoStrip}>Demonstração com dados fictícios — nenhum pedido é enviado ou cobrado.</p>}
    <Header logoUrl={data.establishment.logoUrl ?? data.branding.logoUrl} name={data.branding.name} unitName={data.establishment.name} nav={nav} activeSection={activeSection} query={filters.query}
      onQueryChange={query => patchFilters({ query })} onSearchSubmit={() => scrollToId("cardapio")} cartUnits={units}
      onCartClick={() => { if (window.matchMedia("(min-width: 1180px)").matches) document.getElementById("meu-pedido")?.focus(); else setDialog("cart"); }} />

    <div className={styles.layout}>
      <main className={styles.main}>
        <h1 className={styles.visuallyHidden}>Pedido online — {data.establishment.name}</h1>
        <div id="inicio" className={styles.anchor}><HeroBanner slides={data.slides} /></div>

        <section id="cardapio" className={styles.menu} aria-labelledby="titulo-cardapio">
          <CategoryNavigation categories={data.categories} selected={filters.categoryId} onSelect={categoryId => patchFilters({ categoryId })} />
          <div className={styles.sectionHead}>
            <div>
              <h2 id="titulo-cardapio">{sectionTitle}</h2>
              <p>{refined ? `${visibleProducts.length} ${visibleProducts.length === 1 ? "produto encontrado" : "produtos encontrados"}` : quick.popular ? "Os queridinhos da casa, escolhidos especialmente para você." : "Escolha seus pratos e monte o seu pedido."}</p>
            </div>
            {data.products.length > 0 && <ProductFilters filters={filters} quick={quick} onChange={patchFilters} onOpenAdvanced={() => setDialog("filters")} advancedCount={advancedCount} />}
          </div>

          {data.products.length === 0 ? <div className={styles.emptyState}>
            <UtensilsCrossed aria-hidden />
            <h3>Cardápio indisponível no momento</h3>
            <p>Nenhum produto está disponível para pedido online agora. Tente novamente mais tarde.</p>
          </div> : visibleProducts.length === 0 ? <div className={styles.emptyState}>
            <SearchX aria-hidden />
            <h3>Nenhum produto encontrado</h3>
            <p>Revise a busca ou remova alguns filtros para ver mais opções.</p>
            <button type="button" className={styles.secondaryButton} onClick={resetFilters}><RotateCcw aria-hidden />Limpar busca e filtros</button>
          </div> : <div className={styles.gridWrap}><ul className={styles.grid} aria-label={sectionTitle}>
            {visibleProducts.map((product, index) => <li key={product.id}>
              <ProductCard product={product} favorite={favorites.has(product.id)} onToggleFavorite={() => toggleFavorite(product)} onOpen={() => setDetailsId(product.id)} onAdd={() => quickAdd(product)} requiresChoice={productRequiresChoice(product)} eagerImage={index < 4} />
            </li>)}
          </ul></div>}
        </section>

        <PromoBanners combo={data.comboPromo} loyalty={data.loyalty} onCombo={() => data.comboPromo && goToTarget(data.comboPromo.target)} onLoyalty={() => setDialog("loyalty")} />
        <Benefits benefits={data.benefits} className={styles.benefitsMobile} />
        <InfoSections data={data} />
        <footer className={styles.footer}>
          <span>Pedido online por <b>Mordomê</b></span>
          {source.kind === "live" && <Link href={`/cardapio/${encodeURIComponent(source.establishmentId)}`}>Ver cardápio para consulta</Link>}
        </footer>
      </main>

      <aside className={styles.sidebar} aria-label="Resumo do pedido">
        <div id="meu-pedido" tabIndex={-1} className={styles.sidebarCard}><CartPanel {...cartPanelProps} onCheckout={openCheckout} /></div>
        <Benefits benefits={data.benefits} className={styles.sidebarCard} />
      </aside>
    </div>

    <MobileCartBar units={units} totalCents={totals.totalCents} totalIsFinal={totals.totalIsFinal} onOpen={() => setDialog("cart")} />
    <ToastRegion toasts={toasts} onDismiss={dismiss} />

    <Dialog open={dialog === "cart"} onClose={() => setDialog(null)} title="Meu pedido" variant="sheet" size="md">
      <CartPanel {...cartPanelProps} showTitle={false} onCheckout={() => setDialog("checkout")} />
    </Dialog>
    <ProductDetails product={detailsProduct} categoryName={detailsProduct ? categoryName(detailsProduct.categoryId) : ""} favorite={detailsProduct ? favorites.has(detailsProduct.id) : false}
      onToggleFavorite={() => detailsProduct && toggleFavorite(detailsProduct)} onClose={() => setDetailsId(null)}
      onConfirm={(priced, quantity) => { if (detailsProduct) addPriced(detailsProduct, priced, quantity); setDetailsId(null); }} />
    <FilterDialog open={dialog === "filters"} onClose={() => setDialog(null)} filters={filters} quick={quick} onChange={patchFilters} onReset={resetFilters} resultCount={visibleProducts.length} hasFavorites={favorites.size > 0} />
    <LoyaltyDialog open={dialog === "loyalty"} loyalty={data.loyalty} isDemo={isDemo} onClose={() => setDialog(null)} />
    <Checkout open={dialog === "checkout"} isDemo={isDemo} lines={lines} totals={totals} pickupTotals={pickupTotals} quote={quote} address={address} pickupSupported={data.pickupSupported} paymentMethods={data.paymentMethods} establishmentName={data.establishment.name}
      onClose={() => setDialog(null)} onEditAddress={() => setAddressOpen(true)} onSubmit={submitOrder} onFinished={() => setCouponCode(null)} />
    <DeliveryAddressDialog open={addressOpen} initial={address} areas={data.deliveryAreas} onClose={() => setAddressOpen(false)} onSave={next => { setAddress(next); setAddressOpen(false); push({ message: "Endereço de entrega atualizado." }, 2500); }} />
  </div>;
}

function LoadingState() {
  return <div className={styles.root} aria-busy="true">
    <div className={styles.loadingHeader} />
    <div className={styles.layout}>
      <main className={styles.main}>
        <p className={styles.visuallyHidden} role="status">Carregando cardápio…</p>
        <div className={cx(styles.skeleton, styles.skeletonHero)} />
        <div className={styles.skeletonRow}>{Array.from({ length: 6 }, (_, index) => <div key={index} className={cx(styles.skeleton, styles.skeletonCategory)} />)}</div>
        <div className={styles.skeletonGrid}>{Array.from({ length: 4 }, (_, index) => <div key={index} className={cx(styles.skeleton, styles.skeletonCard)} />)}</div>
      </main>
      <aside className={styles.sidebar}><div className={cx(styles.skeleton, styles.skeletonCart)} /></aside>
    </div>
  </div>;
}

function ErrorState({ message, notFound, onRetry }: { message: string; notFound: boolean; onRetry: () => void }) {
  return <div className={styles.root}>
    <main className={styles.errorPage}>
      <UtensilsCrossed aria-hidden />
      <h1>{notFound ? "Loja não encontrada" : "Não foi possível abrir o cardápio"}</h1>
      <p>{notFound ? "Confira o link recebido do estabelecimento." : message || "Verifique sua conexão e tente novamente."}</p>
      {!notFound && <button type="button" className={styles.primaryButton} onClick={onRetry}><RotateCcw aria-hidden />Tentar novamente</button>}
    </main>
  </div>;
}
