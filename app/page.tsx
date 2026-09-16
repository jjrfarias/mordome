"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { BarChart3, Bell, Bike, Check, ChefHat, ChevronDown, CircleDollarSign, FileBarChart, FileClock, LayoutGrid, LogOut, Minus, Navigation, Plus, Printer, Search, Settings, ShoppingBag, Sparkles, UtensilsCrossed, X } from "lucide-react";
import { money, OrderItem, products, SelectedIngredientOption } from "@/lib/domain";
import { IngredientPicker, productHasIngredientChoices } from "@/components/operations/IngredientPicker";
import { Brand, MetricCard, NavItem } from "@/components/ui";
import { SettingsWorkspace } from "@/components/admin/SettingsWorkspace";
import { ReportsWorkspace } from "@/components/admin/ReportsWorkspace";
import { REPORTS_REGISTRY } from "@/lib/reports/registry";
import { DeliveryManagement } from "@/components/operations/DeliveryManagement";
import { CourierApp } from "@/components/operations/CourierApp";
import { CashManagement } from "@/components/operations/CashManagement";
import { AuditHistory } from "@/components/admin/AuditHistory";
import { FloorManagement } from "@/components/operations/FloorManagement";
import { PaymentComposer, serializeCheckout, type SaleCheckout } from "@/components/operations/PaymentComposer";
import { ReasonSelect } from "@/components/operations/ReasonSelect";
import { printReceipt } from "@/lib/integrations/print-client";

type View = "pdv" | "salão" | "cozinha" | "delivery" | "entregas" | "caixa" | "resumo" | "historico" | "relatorios" | "config";
type AuthSession = { user: { name: string; username: string }; organization: { name: string }; establishment: { id: string; name: string }; establishments: { id: string; name: string }[]; permissionKeys: string[]; canManageEstablishments: boolean; canManageCatalog: boolean; canManageStock: boolean; canManageRecipes: boolean; canSellPos: boolean; canCancelSales: boolean; canRefundSales: boolean; canApplyDiscount: boolean; canOverrideDiscount: boolean; canOperateFloor: boolean; canManageFloor: boolean; canOperateDelivery: boolean; canDeliverOrders: boolean; canCancelSentItems: boolean; canOpenCash: boolean; canMoveCash: boolean; canCloseCash: boolean; canViewCashHistory: boolean; canViewAudit: boolean; canViewFinanceSummary: boolean; canManageFinance: boolean; canManageFinanceEntries: boolean; canViewFinanceCashflow: boolean; canManageSettlements: boolean; canViewUsers: boolean; canCreateUsers: boolean; canDisableUsers: boolean; canResetUserPassword: boolean; canManageRoles: boolean; canManageIntegrations: boolean; canReprint: boolean; printerDriver: string; printTemplate: { headerText: string | null; footerText: string | null; showDocument: boolean; paperWidth: number; establishmentDocument: string | null } };

export default function Home() {
  const [authLoading, setAuthLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [switchingUnit, setSwitchingUnit] = useState(false);
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [view, setView] = useState<View>("salão");
  const [toast, setToast] = useState("");
  const [cashOpen, setCashOpen] = useState(false);

  useEffect(() => { queueMicrotask(async () => {
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      const data = await response.json();
      setNeedsSetup(data.needsSetup);
      if (data.session && !data.session.canOperateFloor) setView(data.session.canSellPos ? "pdv" : data.session.canViewFinanceSummary ? "resumo" : "config");
      setSession(data.session);
    } finally { setAuthLoading(false); }
  }); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2800); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!session) return; const controller = new AbortController(); queueMicrotask(async () => { try { const response = await fetch("/api/operations/cash", { cache: "no-store", signal: controller.signal }); if (response.ok) { const data = await response.json(); setCashOpen(Boolean(data.cash)); } } catch { /* indicador será atualizado ao abrir a tela */ } }); return () => controller.abort(); }, [session]);

  if (authLoading) return <div className="login-page"><section className="login-art"><div className="art-copy"><Brand light /><h2>Preparando seu ambiente…</h2></div></section><section className="login-panel"><div className="login-box"><span className="eyebrow">MORDOMÊ</span><h1>Um instante.</h1><p>Estamos verificando seu acesso com segurança.</p></div></section></div>;
  if (!session) return <Login needsSetup={needsSetup} onAuthenticated={async () => { const response = await fetch("/api/auth/session", { cache: "no-store" }); if (response.ok) { const data = await response.json(); setSession(data.session); setNeedsSetup(false); } }} />;

  const notify = (message: string) => setToast(message);
  const refreshSession = async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setSession(data.session);
  };
  const switchEstablishment = async (establishmentId: string) => {
    if (establishmentId === session.establishment.id) return;
    setSwitchingUnit(true);
    try {
      const response = await fetch("/api/auth/establishment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ establishmentId }) });
      const data = await response.json();
      if (!response.ok) { notify(data.error ?? "Não foi possível trocar de unidade"); return; }
      setSession(data.session); notify(`Unidade alterada para ${data.session.establishment.name}`);
    } catch { notify("Não foi possível conectar ao servidor"); } finally { setSwitchingUnit(false); }
  };
  const completeSale = async (items: { id: string; quantity: number; selectedOptions?: { groupId: string; optionIds: string[] }[] }[], checkout: SaleCheckout, channel: "POS" | "FLOOR" | "DELIVERY", table?: number, tabId?: string, deliveryOrderId?: string) => {
    try {
      const response = await fetch("/api/operations/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "COMPLETE", channel, items: items.map(item => ({ productId: item.id, quantity: item.quantity, selectedOptions: item.selectedOptions })), ...checkout, table, tabId, deliveryOrderId, idempotencyKey: crypto.randomUUID() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { notify(data.error ?? "Não foi possível concluir a venda"); return false; }
      return true;
    } catch { notify("Não foi possível conectar ao servidor"); return false; }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand compact />
      <nav>
        <span className="nav-label">Operação</span>
        {session.canSellPos && <NavItem active={view === "pdv"} icon={<ShoppingBag />} label="PDV rápido" onClick={() => { setView("pdv"); }} />}
        {session.canOperateFloor && <NavItem active={view === "salão"} icon={<LayoutGrid />} label="Salão" onClick={() => { setView("salão"); }} />}
        {session.canOperateFloor && <NavItem active={view === "cozinha"} icon={<ChefHat />} label="Cozinha" onClick={() => { setView("cozinha"); }} />}
        {session.canOperateDelivery && <NavItem active={view === "delivery"} icon={<Bike />} label="Delivery" onClick={() => { setView("delivery"); }} />}
        {session.canDeliverOrders && <NavItem active={view === "entregas"} icon={<Navigation />} label="Minhas entregas" onClick={() => { setView("entregas"); }} />}
        {(session.canOpenCash || session.canMoveCash || session.canCloseCash || session.canViewCashHistory) && <NavItem active={view === "caixa"} icon={<CircleDollarSign />} label="Caixa" onClick={() => { setView("caixa"); }} />}
        {(session.canViewFinanceSummary || session.canViewAudit) && <span className="nav-label nav-label-spaced">Análise</span>}
        {session.canViewFinanceSummary && <NavItem active={view === "resumo"} icon={<BarChart3 />} label="Resumo" onClick={() => { setView("resumo"); }} />}
        {session.canViewAudit && <NavItem active={view === "historico"} icon={<FileClock />} label="Histórico" onClick={() => { setView("historico"); }} />}
        {REPORTS_REGISTRY.some(report => session.permissionKeys.includes(report.permissionKey)) && <NavItem active={view === "relatorios"} icon={<FileBarChart />} label="Relatórios" onClick={() => { setView("relatorios"); }} />}
        {(session.canManageEstablishments || session.canManageCatalog || session.canManageStock || session.canManageRecipes || session.canManageFloor || session.canViewUsers || session.canManageRoles || session.canManageIntegrations) && <><span className="nav-label nav-label-spaced">Administração</span><NavItem active={view === "config"} icon={<Settings />} label="Configurações" onClick={() => { setView("config"); }} /></>}
      </nav>
      <div className="sidebar-footer">
        <div className="unit-switcher-card">
          <div className="unit-switcher-heading"><span>Unidade ativa</span><i /></div>
          <div className="unit-dropdown" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setUnitMenuOpen(false); }} onKeyDown={event => { if (event.key === "Escape") setUnitMenuOpen(false); }}>
            <button type="button" className="unit-dropdown-trigger" aria-haspopup="listbox" aria-expanded={unitMenuOpen} disabled={switchingUnit} onClick={() => setUnitMenuOpen(open => !open)}>
              <b>{session.establishment.name}</b><ChevronDown />
            </button>
            {unitMenuOpen && <div className="unit-dropdown-menu" role="listbox" aria-label="Trocar unidade">
              {session.establishments.map(establishment => <button type="button" role="option" aria-selected={establishment.id === session.establishment.id} className={establishment.id === session.establishment.id ? "active" : ""} key={establishment.id} onClick={() => { setUnitMenuOpen(false); void switchEstablishment(establishment.id); }}><span>{establishment.name}</span>{establishment.id === session.establishment.id && <Check />}</button>)}
            </div>}
          </div>
          <small>{switchingUnit ? "Trocando unidade…" : session.establishments.length > 1 ? `${session.establishments.length} unidades disponíveis` : "Unidade principal"}</small>
        </div>
        <div className="user-card"><div className="avatar">{session.user.name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase()}</div><div><b>{session.user.name}</b><span>@{session.user.username}</span></div><button aria-label="Sair" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); setSession(null); }}><LogOut /></button></div>
      </div>
    </aside>
    <main>
      <header><div><span className="header-date">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}</span><h1>{view === "pdv" ? "PDV rápido" : view === "salão" ? "Gestão do salão" : view === "cozinha" ? "Cozinha" : view === "delivery" ? "Delivery" : view === "entregas" ? "Minhas entregas" : view === "caixa" ? "Caixa" : view === "historico" ? "Histórico" : view === "relatorios" ? "Relatórios" : view === "config" ? "Configurações" : "Resumo do dia"}</h1></div><div className="header-actions"><span className="sync-state"><i /> Sincronizado agora</span><button className="icon-button" aria-label="Notificações"><Bell /></button><button className={`open-pill ${cashOpen ? "" : "closed"}`} onClick={() => setView("caixa")}><span /> {cashOpen ? "Caixa aberto" : "Caixa fechado"}</button></div></header>
      {view === "pdv" && <Pos establishmentId={session.establishment.id} onFinish={async (items, checkout) => { const saleItems = items.map(item => ({ id: item.id, quantity: item.quantity, selectedOptions: item.optionSelections })); if (!await completeSale(saleItems, checkout, "POS")) return false; if (session.printerDriver === "browser_print") printReceipt({ establishmentName: session.establishment.name, items: items.map(item => ({ name: item.selectedOptions?.length ? `${item.name} — ${item.selectedOptions.map(option => option.optionName).join(", ")}` : item.name, quantity: item.quantity, unitPrice: item.price })), total: items.reduce((sum, item) => sum + item.price * item.quantity, 0) - checkout.discount, payment: checkout.payments.map(p => p.method).join(" + "), channel: "POS" }, session.printTemplate); notify("Venda realizada e estoque atualizado"); return true; }} />}
      {view === "salão" && <FloorManagement establishmentId={session.establishment.id} establishmentName={session.establishment.name} printerDriver={session.printerDriver} printTemplate={session.printTemplate} mode="salon" canCancelSentItems={session.canCancelSentItems} canReprint={session.canReprint} onToast={notify} onFinishSale={(items, payment, table, tabId) => completeSale(items, payment, "FLOOR", table, tabId)} />}
      {view === "cozinha" && <FloorManagement establishmentId={session.establishment.id} establishmentName={session.establishment.name} printerDriver={session.printerDriver} printTemplate={session.printTemplate} mode="kitchen" canCancelSentItems={session.canCancelSentItems} canReprint={session.canReprint} onToast={notify} onFinishSale={(items, payment, table, tabId) => completeSale(items, payment, "FLOOR", table, tabId)} />}
      {view === "delivery" && <DeliveryManagement establishmentId={session.establishment.id} establishmentName={session.establishment.name} onToast={notify} onFinishSale={(items, checkout, deliveryOrderId) => completeSale(items, checkout, "DELIVERY", undefined, undefined, deliveryOrderId)} />}
      {view === "entregas" && <CourierApp />}
      {view === "caixa" && <CashManagement establishmentId={session.establishment.id} establishmentName={session.establishment.name} canOpen={session.canOpenCash} canMove={session.canMoveCash} canClose={session.canCloseCash} onCashChanged={setCashOpen} />}
      {view === "resumo" && session.canViewFinanceSummary && <Summary establishmentId={session.establishment.id} establishmentName={session.establishment.name} printerDriver={session.printerDriver} printTemplate={session.printTemplate} canReprint={session.canReprint} canCancelSales={session.canCancelSales} canRefundSales={session.canRefundSales} onToast={notify} />}
      {view === "historico" && session.canViewAudit && <AuditHistory establishments={session.establishments} />}
      {view === "relatorios" && <ReportsWorkspace permissionKeys={session.permissionKeys} />}
      {view === "config" && (session.canManageEstablishments || session.canManageCatalog || session.canManageStock || session.canManageRecipes || session.canManageFloor || session.canViewUsers || session.canManageRoles || session.canManageIntegrations || session.canManageFinance || session.canManageFinanceEntries || session.canViewFinanceCashflow || session.canManageSettlements) && <SettingsWorkspace activeEstablishmentId={session.establishment.id} activeEstablishmentName={session.establishment.name} canManageEstablishments={session.canManageEstablishments} canManageCatalog={session.canManageCatalog} canManageStock={session.canManageStock} canManageRecipes={session.canManageRecipes} canViewUsers={session.canViewUsers} canCreateUsers={session.canCreateUsers} canDisableUsers={session.canDisableUsers} canResetUserPassword={session.canResetUserPassword} canManageRoles={session.canManageRoles} canManageIntegrations={session.canManageIntegrations} canManageFloor={session.canManageFloor} canManageFinance={session.canManageFinance} canManageFinanceEntries={session.canManageFinanceEntries} canViewFinanceCashflow={session.canViewFinanceCashflow} canManageSettlements={session.canManageSettlements} onChanged={refreshSession} />}
    </main>
    <MobileNav view={view} setView={setView} canSellPos={session.canSellPos} canOperateFloor={session.canOperateFloor} canOperateDelivery={session.canOperateDelivery} canDeliverOrders={session.canDeliverOrders} canViewFinanceSummary={session.canViewFinanceSummary} canManageEstablishments={session.canManageEstablishments || session.canManageCatalog || session.canManageStock || session.canManageRecipes || session.canManageFloor || session.canViewUsers || session.canManageRoles || session.canManageIntegrations || session.canManageFinance || session.canManageFinanceEntries || session.canViewFinanceCashflow || session.canManageSettlements} />
    {toast && <div className="toast"><Sparkles />{toast}</div>}
  </div>;
}

function Login({ needsSetup, onAuthenticated }: { needsSetup: boolean; onAuthenticated: () => Promise<void> }) {
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries());
    if (needsSetup && payload.password !== payload.confirmPassword) { setError("As senhas não coincidem."); setLoading(false); return; }
    delete payload.confirmPassword;
    try {
      const response = await fetch(needsSetup ? "/api/auth/setup" : "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) { setError(data.error ?? "Não foi possível entrar."); return; }
      await onAuthenticated();
    } catch { setError("Não foi possível conectar ao servidor."); } finally { setLoading(false); }
  };
  return <div className="login-page betao-login">
    <section className="login-art betao-login-art">
      <div className="betao-stamp"><span>DESDE</span><b>+25</b><span>ANOS</span></div>
      <div className="art-copy betao-art-copy">
        <Image className="betao-login-logo" src="/clientes/betao/logo-recriada-v1.png" alt="Betão Hot Dog" width={190} height={190} priority />
        <span className="betao-family">FAMÍLIA BETÃO · MACAÉ</span>
        <h2>{needsSetup ? <>Toda a operação.<br/>Em um só lugar.</> : <>A casa está pronta.<br/>Pode entrar.</>}</h2>
        <p>{needsSetup ? "Prepare o primeiro acesso para acompanhar a Família Betão pelo Mordomê." : "Salão, balcão, cozinha e caixa no mesmo ritmo."}</p>
      </div>
    </section>
    <section className="login-panel betao-login-panel"><div className="login-box betao-login-box">
      <div className="mobile-brand"><Brand /></div>
      <span className="eyebrow">{needsSetup ? "CONFIGURAÇÃO DA OPERAÇÃO" : "ACESSO À OPERAÇÃO"}</span>
      <h1>{needsSetup ? "Primeiro acesso." : "Bem-vindo de volta."}</h1>
      <p>{needsSetup ? "Cadastre o responsável e defina as credenciais iniciais." : "Use seu usuário e senha para continuar."}</p>
      <form onSubmit={submit}>{needsSetup && <><label>Seu nome<input name="ownerName" autoComplete="name" required minLength={2}/></label><label>Nome da empresa<input name="organizationName" required minLength={2}/></label><label>Nome do estabelecimento<input name="establishmentName" required minLength={2}/></label></>}<label>Usuário<input name="username" autoComplete="username" required minLength={3} maxLength={40} pattern="[A-Za-z0-9._\-]+" autoFocus={!needsSetup}/></label><label>Senha<input name="password" type="password" autoComplete={needsSetup ? "new-password" : "current-password"} required minLength={needsSetup ? 8 : 1}/></label>{needsSetup && <label>Confirmar senha<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8}/></label>}{error && <div className="auth-error" role="alert">{error}</div>}<button className="primary wide betao-enter" disabled={loading}>{loading ? "Aguarde…" : needsSetup ? "Criar acesso" : "Entrar"}</button></form>
      {needsSetup && <div className="demo-note"><Sparkles/><span><b>Acesso do responsável</b>Outros usuários e permissões serão configurados depois.</span></div>}
      <div className="powered-by"><span>Operação Betão</span><i/>Mordomê <em>by JCS</em></div>
    </div></section>
  </div>;
}

function useOperationalCatalog(channel: "POS" | "FLOOR", establishmentId: string) {
  const [items, setItems] = useState<typeof products>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); queueMicrotask(async () => { setLoading(true); setError(""); try { const response = await fetch(`/api/operations/catalog?channel=${channel}`, { cache: "no-store", signal: controller.signal }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o catálogo."); setItems(data.products.map((product: Omit<typeof products[number], "emoji">) => ({ ...product, emoji: product.category.toLocaleLowerCase("pt-BR").includes("bebida") ? "🥤" : "🌭", imageUrl: product.imageUrl })));} catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o catálogo."); } finally { if (!controller.signal.aborted) setLoading(false); } }); return () => controller.abort(); }, [channel, establishmentId]);
  return { products: items, loading, error };
}

function Pos({ establishmentId, onFinish }: { establishmentId: string; onFinish: (items: OrderItem[], checkout: SaleCheckout) => Promise<boolean> }) {
  const operational = useOperationalCatalog("POS", establishmentId);
  const [cart, setCart] = useState<OrderItem[]>([]); const [query, setQuery] = useState(""); const [payments, setPayments] = useState([{ method: "Pix", amount: "", receivedAmount: "" }]); const [discount, setDiscount] = useState(""); const [discountReason, setDiscountReason] = useState(""); const [category, setCategory] = useState("Todos"); const [finishing, setFinishing] = useState(false);
  const [pickerProduct, setPickerProduct] = useState<typeof products[number] | null>(null);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const addPlain = (product: typeof products[number]) => setCart(current => { const found = current.find(item => item.id === product.id && !item.selectedOptions?.length); return found ? current.map(item => item === found ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1, cartLineId: crypto.randomUUID() }]; });
  const addWithOptions = (product: typeof products[number], unitPrice: number, selectedOptions: SelectedIngredientOption[], optionSelections: { groupId: string; optionIds: string[] }[]) => setCart(current => [...current, { ...product, price: unitPrice, quantity: 1, cartLineId: crypto.randomUUID(), selectedOptions, optionSelections }]);
  const add = (product: typeof products[number]) => {
    if (productHasIngredientChoices(product)) { setPickerProduct(product); return; }
    addPlain(product);
  };
  const change = (cartLineId: string, delta: number) => setCart(current => current.map(item => item.cartLineId === cartLineId ? { ...item, quantity: item.quantity + delta } : item).filter(item => item.quantity > 0));
  const categories = ["Todos", ...new Set(operational.products.map(product => product.category))];
  const visibleProducts = operational.products.filter(p => (category === "Todos" || p.category === category) && p.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="pos-layout">
    <section className="pos-products"><div className="pos-intro"><div><span className="section-kicker">Balcão</span><h2>Venda direta</h2><p>Produtos habilitados no PDV desta unidade.</p></div><div className="search"><Search/><input placeholder="Buscar produto..." value={query} onChange={e => setQuery(e.target.value)}/><kbd>F2</kbd></div></div><div className="pos-category-bar">{categories.map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>{operational.error && <div className="auth-error">{operational.error}</div>}{operational.loading ? <div className="empty"><span>Carregando catálogo…</span></div> : visibleProducts.length === 0 ? <div className="big-empty"><ShoppingBag/><h2>Nenhum produto no PDV</h2><p>Habilite produtos no canal PDV do Cardápio.</p></div> : <div className="pos-product-grid">{visibleProducts.map(product => <button key={product.id} className="pos-product" onClick={() => add(product)}><span>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : product.emoji}</span><div><small>{product.category}</small><b>{product.name}</b><strong>{money(product.price)}</strong></div><Plus/></button>)}</div>}</section>
    <aside className="pos-cart"><div className="pos-cart-head"><div><span>VENDA ATUAL</span><h2>{cart.reduce((sum, item) => sum + item.quantity, 0)} itens</h2></div>{cart.length > 0 && <button onClick={() => setCart([])}>Limpar</button>}</div><div className="pos-cart-items">{cart.length === 0 ? <div className="empty"><ShoppingBag/><b>Nenhum produto</b><span>Toque em um produto para começar a venda.</span></div> : cart.map(item => <div className="pos-cart-row" key={item.cartLineId}><span className="food">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.emoji}</span><div><b>{item.name}</b>{item.selectedOptions?.length ? <small className="pos-cart-options">{item.selectedOptions.map(option => option.optionName).join(", ")}</small> : null}<small>{money(item.price * item.quantity)}</small></div><div className="stepper"><button onClick={() => change(item.cartLineId!, -1)}><Minus/></button><b>{item.quantity}</b><button onClick={() => change(item.cartLineId!, 1)}><Plus/></button></div></div>)}</div><div className="pos-payment"><PaymentComposer grossTotal={total} discount={discount} setDiscount={setDiscount} discountReason={discountReason} setDiscountReason={setDiscountReason} payments={payments} setPayments={setPayments}/><button className="primary wide" disabled={!cart.length || finishing} onClick={async () => { setFinishing(true); const completed = await onFinish(cart, serializeCheckout(payments, discount, discountReason, total)); setFinishing(false); if (completed) { setCart([]); setDiscount(""); setDiscountReason(""); setPayments([{ method: "Pix", amount: "", receivedAmount: "" }]); } }}><CircleDollarSign/> {finishing ? "Finalizando…" : "Finalizar venda"}</button><small className="shortcut-hint">Atalho: pressione <kbd>F8</kbd> para finalizar</small></div></aside>
    {pickerProduct && <IngredientPicker product={pickerProduct} onClose={() => setPickerProduct(null)} onConfirm={(unitPrice, selectedOptions, optionSelections) => { addWithOptions(pickerProduct, unitPrice, selectedOptions, optionSelections); setPickerProduct(null); }} />}
  </div>;
}

type SummarySale = { id: string; channel: string; table: number | null; payment: string; total: number; refunded?: number; status?: string; completedAt: string; items: { productName: string; quantity: number; unitPrice: number }[] };
type SummaryData = { revenueToday: number; salesCountToday: number; averageTicket: number; ongoingOrders: number; recentSales: SummarySale[]; ranking: { productName: string; quantity: number }[] };

function Summary({ establishmentId, establishmentName, printerDriver, printTemplate, canReprint, canCancelSales, canRefundSales, onToast }: { establishmentId: string; establishmentName: string; printerDriver: string; printTemplate: { headerText: string | null; footerText: string | null; showDocument: boolean; paperWidth: number; establishmentDocument: string | null }; canReprint: boolean; canCancelSales: boolean; canRefundSales: boolean; onToast: (message: string) => void }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelTarget, setCancelTarget] = useState<SummarySale | null>(null);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [refundTarget, setRefundTarget] = useState<SummarySale | null>(null);
  const [refundAmount, setRefundAmount] = useState(""); const [refundReason, setRefundReason] = useState(""); const [refundMethod, setRefundMethod] = useState("Pix"); const [restoreStock, setRestoreStock] = useState(false); const [refunding, setRefunding] = useState(false);

  const load = async () => { setLoading(true); setError(""); try { const response = await fetch("/api/operations/summary", { cache: "no-store" }); const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error ?? "Não foi possível carregar o resumo."); setData(json); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o resumo."); } finally { setLoading(false); } };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [establishmentId]);

  const reprintSale = async (sale: SummarySale) => {
    try {
      const response = await fetch("/api/operations/prints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType: "Sale", entityId: sale.id, reason: "Reimpressão do comprovante de venda" }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível registrar a reimpressão.");
      printReceipt({ establishmentName, items: sale.items.map(item => ({ name: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })), total: sale.total, payment: sale.payment, channel: sale.channel === "POS" ? "POS" : "FLOOR", table: sale.table ?? undefined }, printTemplate);
      onToast("Reimpressão registrada no histórico");
    } catch (cause) { onToast(cause instanceof Error ? cause.message : "Não foi possível reimprimir."); }
  };

  const confirmCancel = async () => {
    if (!cancelTarget || reason.trim().length < 3) return;
    setCancelling(true); setCancelError("");
    try {
      const response = await fetch("/api/operations/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CANCEL", saleId: cancelTarget.id, reason: reason.trim(), idempotencyKey: crypto.randomUUID() }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Não foi possível cancelar a venda.");
      setCancelTarget(null); setReason(""); onToast("Venda cancelada e estoque estornado"); await load();
    } catch (cause) { setCancelError(cause instanceof Error ? cause.message : "Não foi possível cancelar a venda."); } finally { setCancelling(false); }
  };

  const confirmRefund = async () => {
    if (!refundTarget) return; const amount = Number(refundAmount.replace(",", ".")); if (!Number.isFinite(amount) || amount <= 0 || refundReason.trim().length < 3) return;
    setRefunding(true); setCancelError("");
    try { const response = await fetch("/api/operations/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REFUND", saleId: refundTarget.id, amount, payments: [{ method: refundMethod, amount }], restoreStock, reason: refundReason.trim(), idempotencyKey: crypto.randomUUID() }) }); const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error ?? "Não foi possível registrar o reembolso."); setRefundTarget(null); onToast("Reembolso registrado no caixa atual"); await load(); }
    catch (cause) { setCancelError(cause instanceof Error ? cause.message : "Não foi possível registrar o reembolso."); } finally { setRefunding(false); }
  };

  if (loading) return <div className="page-content"><div className="empty"><span>Carregando resumo…</span></div></div>;
  if (error) return <div className="page-content"><div className="auth-error">{error}</div></div>;
  if (!data) return null;

  return <div className="page-content"><div className="hero-row"><div><span className="section-kicker">Pulso do negócio</span><p>Uma visão clara do desempenho de hoje.</p></div><button className="date-button">Hoje, {new Date().toLocaleDateString("pt-BR")}</button></div><div className="metric-grid"><MetricCard label="Vendas do dia" value={money(data.revenueToday)} note={`${data.salesCountToday} vendas finalizadas`} icon={<CircleDollarSign/>}/><MetricCard label="Pedidos em andamento" value={data.ongoingOrders.toString()} note="no salão e cozinha" icon={<ChefHat/>}/><MetricCard label="Ticket médio" value={money(data.averageTicket)} note="por venda finalizada" icon={<BarChart3/>}/></div><div className="summary-grid"><section className="panel"><h2>Vendas recentes</h2>{data.recentSales.length === 0 ? <div className="empty small"><CircleDollarSign/><b>Nenhuma venda ainda</b><span>Finalize uma venda para vê-la aqui.</span></div> : data.recentSales.map(sale => <div className="sale-row" key={sale.id}><div className="sale-icon">{sale.channel === "POS" ? <ShoppingBag/> : <UtensilsCrossed/>}</div><div><b>{sale.channel === "POS" ? "Venda rápida" : sale.table ? `Mesa ${sale.table.toString().padStart(2, "0")}` : "Salão"}</b><span>{new Date(sale.completedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {sale.payment} • {sale.channel}</span></div><strong>{money(sale.total - (sale.refunded ?? 0))}</strong>{canRefundSales && sale.status !== "REFUNDED" && <button className="sale-cancel" title="Reembolsar venda" onClick={() => { setRefundTarget(sale); setRefundAmount((sale.total - (sale.refunded ?? 0)).toFixed(2)); setRefundReason(""); setRestoreStock(false); setCancelError(""); }}><CircleDollarSign/></button>}{canCancelSales && !sale.refunded && <button className="sale-cancel" title="Cancelar venda" onClick={() => { setCancelTarget(sale); setReason(""); setCancelError(""); }}><X/></button>}</div>)}</section><section className="panel"><h2>Mais pedidos</h2>{data.ranking.length === 0 ? <div className="empty small"><BarChart3/><b>Sem vendas suficientes</b><span>O ranking aparece após as primeiras vendas do dia.</span></div> : data.ranking.map((item, index) => <div className="rank" key={item.productName}><em>{index + 1}</em><span className="food"><UtensilsCrossed/></span><div><b>{item.productName}</b><span>{item.quantity} vendidos</span></div></div>)}</section></div>
    {canReprint && printerDriver === "browser_print" && data.recentSales.length > 0 && <section className="panel reprint-panel"><div><span className="section-kicker">Impressão</span><h2>Reimprimir comprovante</h2><p>A solicitação fica registrada no histórico do sistema.</p></div><div className="reprint-actions">{data.recentSales.slice(0, 5).map(sale => <button className="secondary" key={sale.id} onClick={() => void reprintSale(sale)}><Printer/> {sale.channel === "POS" ? "Venda rápida" : sale.table ? `Mesa ${sale.table}` : "Salão"} · {new Date(sale.completedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</button>)}</div></section>}
    {refundTarget && <div className="modal-bg"><div className="modal"><button className="modal-close" onClick={() => setRefundTarget(null)}><X/></button><span className="modal-icon"><CircleDollarSign/></span><h2>Registrar reembolso</h2><p>O lançamento sairá do caixa aberto agora, mesmo que a venda pertença a um caixa anterior.</p><label>Valor<input inputMode="decimal" value={refundAmount} onChange={event => setRefundAmount(event.target.value)} /></label><label>Forma de devolução<select value={refundMethod} onChange={event => setRefundMethod(event.target.value)}><option>Pix</option><option>Cartão de crédito</option><option>Cartão de débito</option><option>Dinheiro</option></select></label><ReasonSelect category="REFUND" value={refundReason} onChange={setRefundReason} placeholder="Ex.: cliente insatisfeito" /><label className="check-line"><input type="checkbox" checked={restoreStock} onChange={event => setRestoreStock(event.target.checked)} />Repor estoque (somente no reembolso total)</label>{cancelError && <div className="auth-error">{cancelError}</div>}<button className="primary wide" disabled={refunding || refundReason.trim().length < 3} onClick={() => void confirmRefund()}>{refunding ? "Registrando…" : "Confirmar reembolso"}</button></div></div>}
    {cancelTarget && <div className="modal-bg"><div className="modal">
      <button className="modal-close" onClick={() => setCancelTarget(null)}><X/></button>
      <span className="modal-icon"><CircleDollarSign/></span>
      <h2>Cancelar venda</h2>
      <p>Confirme o cancelamento de <b>{money(cancelTarget.total)}</b>. O estoque consumido será estornado.</p>
      <ReasonSelect category="SALE_CANCEL" value={reason} onChange={setReason} autoFocus placeholder="Ex.: pedido em duplicidade" />
      {cancelError && <div className="auth-error">{cancelError}</div>}
      <button className="primary wide" disabled={cancelling || reason.trim().length < 3} onClick={confirmCancel}>{cancelling ? "Cancelando…" : "Confirmar cancelamento"}</button>
    </div></div>}
  </div>;
}
function MobileNav({ view, setView, canSellPos, canOperateFloor, canOperateDelivery, canDeliverOrders, canViewFinanceSummary, canManageEstablishments }: { view: View; setView: (v: View) => void; canSellPos: boolean; canOperateFloor: boolean; canOperateDelivery: boolean; canDeliverOrders: boolean; canViewFinanceSummary: boolean; canManageEstablishments: boolean }) { return <nav className="mobile-nav">{canSellPos && <button className={view === "pdv" ? "active" : ""} onClick={() => setView("pdv")}><ShoppingBag/>PDV</button>}{canOperateFloor && <button className={view === "salão" ? "active" : ""} onClick={() => setView("salão")}><LayoutGrid/>Salão</button>}{canOperateFloor && <button className={view === "cozinha" ? "active" : ""} onClick={() => setView("cozinha")}><ChefHat/>Cozinha</button>}{canOperateDelivery && <button className={view === "delivery" ? "active" : ""} onClick={() => setView("delivery")}><Bike/>Delivery</button>}{canDeliverOrders && <button className={view === "entregas" ? "active" : ""} onClick={() => setView("entregas")}><Navigation/>Entregas</button>}{canViewFinanceSummary && <button className={view === "resumo" ? "active" : ""} onClick={() => setView("resumo")}><BarChart3/>Resumo</button>}{canManageEstablishments && <button className={view === "config" ? "active" : ""} onClick={() => setView("config")}><Settings/>Ajustes</button>}</nav>; }
