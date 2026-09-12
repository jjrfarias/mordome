"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BarChart3, Bell, ChefHat, ChevronLeft, CircleDollarSign, Clock3, LayoutGrid, LogOut, Minus, Plus, Search, ShoppingBag, Sparkles, UtensilsCrossed, X } from "lucide-react";
import { addProduct, closeTable, initialState, money, OrderItem, OrderStatus, products, recordPosSale, RestaurantState, tableTotal } from "@/lib/domain";
import { Brand, KpiCard, MetricCard, NavItem } from "@/components/ui";

type View = "pdv" | "salão" | "cozinha" | "resumo";
const storageKey = (establishmentId: string) => `mordome:demo:${establishmentId}:v1`;
type AuthSession = { user: { name: string; username: string }; organization: { name: string }; establishment: { id: string; name: string }; establishments: { id: string; name: string }[] };

export default function Home() {
  const [authLoading, setAuthLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [state, setState] = useState<RestaurantState>(() => initialState());
  const [loadedEstablishmentId, setLoadedEstablishmentId] = useState<string | null>(null);
  const [switchingUnit, setSwitchingUnit] = useState(false);
  const [view, setView] = useState<View>("salão");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => { queueMicrotask(async () => {
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      const data = await response.json();
      setNeedsSetup(data.needsSetup);
      if (data.session) { const saved = localStorage.getItem(storageKey(data.session.establishment.id)); setState(saved ? JSON.parse(saved) : initialState()); setLoadedEstablishmentId(data.session.establishment.id); }
      setSession(data.session);
    } finally { setAuthLoading(false); }
  }); }, []);
  useEffect(() => { if (session && loadedEstablishmentId === session.establishment.id) localStorage.setItem(storageKey(session.establishment.id), JSON.stringify(state)); }, [state, session, loadedEstablishmentId]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2800); return () => clearTimeout(timer); }, [toast]);

  if (authLoading) return <div className="login-page"><section className="login-art"><div className="art-copy"><Brand light /><h2>Preparando seu ambiente…</h2></div></section><section className="login-panel"><div className="login-box"><span className="eyebrow">MORDOMÊ</span><h1>Um instante.</h1><p>Estamos verificando seu acesso com segurança.</p></div></section></div>;
  if (!session) return <Login needsSetup={needsSetup} onAuthenticated={async () => { const response = await fetch("/api/auth/session", { cache: "no-store" }); if (response.ok) { const data = await response.json(); const saved = localStorage.getItem(storageKey(data.session.establishment.id)); setState(saved ? JSON.parse(saved) : initialState()); setLoadedEstablishmentId(data.session.establishment.id); setSession(data.session); setNeedsSetup(false); } }} />;
  const selected = state.tables.find((table) => table.id === selectedId);
  const ongoing = state.tables.filter((table) => table.orderStatus && table.orderStatus !== "Entregue");
  const revenue = state.sales.reduce((sum, sale) => sum + sale.total, 0);

  const updateTable = (id: number, updater: (table: RestaurantState["tables"][number]) => RestaurantState["tables"][number]) => setState(current => ({ ...current, tables: current.tables.map(table => table.id === id ? updater(table) : table) }));
  const notify = (message: string) => setToast(message);
  const switchEstablishment = async (establishmentId: string) => {
    if (establishmentId === session.establishment.id) return;
    setSwitchingUnit(true);
    try {
      const response = await fetch("/api/auth/establishment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ establishmentId }) });
      const data = await response.json();
      if (!response.ok) { notify(data.error ?? "Não foi possível trocar de unidade"); return; }
      const saved = localStorage.getItem(storageKey(data.session.establishment.id));
      setState(saved ? JSON.parse(saved) : initialState()); setLoadedEstablishmentId(data.session.establishment.id);
      setSelectedId(null); setSession(data.session); notify(`Unidade alterada para ${data.session.establishment.name}`);
    } catch { notify("Não foi possível conectar ao servidor"); } finally { setSwitchingUnit(false); }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand compact />
      <nav>
        <span className="nav-label">Operação</span>
        <NavItem active={view === "pdv"} icon={<ShoppingBag />} label="PDV rápido" onClick={() => { setView("pdv"); setSelectedId(null); }} />
        <NavItem active={view === "salão"} icon={<LayoutGrid />} label="Salão" onClick={() => { setView("salão"); setSelectedId(null); }} />
        <NavItem active={view === "cozinha"} icon={<ChefHat />} label="Cozinha" badge={ongoing.length} onClick={() => { setView("cozinha"); setSelectedId(null); }} />
        <span className="nav-label nav-label-spaced">Análise</span>
        <NavItem active={view === "resumo"} icon={<BarChart3 />} label="Resumo" onClick={() => { setView("resumo"); setSelectedId(null); }} />
      </nav>
      <div className="shift-card"><span>Turno atual</span><b>Almoço</b><small>Aberto às 10:42</small><i /></div>
      <div className="user-card"><div className="avatar">{session.user.name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase()}</div><div><b>{session.user.name}</b><span>@{session.user.username}</span></div><button aria-label="Sair" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); setLoadedEstablishmentId(null); setSession(null); }}><LogOut /></button></div>
    </aside>
    <main>
      <header><div><div className="establishment-line"><label><span>Unidade</span><select aria-label="Unidade ativa" value={session.establishment.id} disabled={switchingUnit} onChange={event => switchEstablishment(event.target.value)}>{session.establishments.map(establishment => <option key={establishment.id} value={establishment.id}>{establishment.name}</option>)}</select></label><i>•</i><span>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}</span></div><h1>{view === "pdv" ? "PDV rápido" : view === "salão" ? selected ? `Mesa ${selected.id}` : "Gestão do salão" : view === "cozinha" ? "Cozinha" : "Resumo do dia"}</h1></div><div className="header-actions"><span className="sync-state"><i /> Sincronizado agora</span><button className="icon-button" aria-label="Notificações"><Bell /></button><div className="open-pill"><span /> Caixa aberto</div></div></header>
      {view === "pdv" && <Pos onFinish={(items, payment) => { setState(current => recordPosSale(current, items, payment)); notify("Venda realizada com sucesso"); }} />}
      {view === "salão" && !selected && <Salon state={state} onSelect={setSelectedId} />}
      {view === "salão" && selected && <Command table={selected} search={search} setSearch={setSearch} onBack={() => setSelectedId(null)} onAdd={product => { updateTable(selected.id, table => addProduct(table, product)); notify(`${product.name} adicionado`); }} onQuantity={(productId, delta) => updateTable(selected.id, table => ({ ...table, items: table.items.map(item => item.id === productId ? { ...item, quantity: item.quantity + delta } : item).filter(item => item.quantity > 0) }))} onSend={() => { updateTable(selected.id, table => ({ ...table, orderStatus: "Recebido" })); notify("Pedido enviado para a cozinha"); }} onClose={payment => { setState(current => closeTable(current, selected.id, payment)); setSelectedId(null); notify("Conta fechada com sucesso"); }} />}
      {view === "cozinha" && <Kitchen tables={state.tables} onStatus={(id, status) => { updateTable(id, table => ({ ...table, orderStatus: status })); notify(`Mesa ${id}: ${status}`); }} />}
      {view === "resumo" && <Summary state={state} revenue={revenue} ongoing={ongoing.length} />}
    </main>
    <MobileNav view={view} setView={setView} />
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
      <form onSubmit={submit}>{needsSetup && <><label>Seu nome<input name="ownerName" autoComplete="name" required minLength={2}/></label><label>Nome da empresa<input name="organizationName" required minLength={2}/></label><label>Nome do estabelecimento<input name="establishmentName" required minLength={2}/></label></>}<label>Usuário<input name="username" autoComplete="username" required minLength={3} maxLength={40} pattern="[A-Za-z0-9._-]+" autoFocus={!needsSetup}/></label><label>Senha<input name="password" type="password" autoComplete={needsSetup ? "new-password" : "current-password"} required minLength={needsSetup ? 8 : 1}/></label>{needsSetup && <label>Confirmar senha<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8}/></label>}{error && <div className="auth-error" role="alert">{error}</div>}<button className="primary wide betao-enter" disabled={loading}>{loading ? "Aguarde…" : needsSetup ? "Criar acesso" : "Entrar"}</button></form>
      {needsSetup && <div className="demo-note"><Sparkles/><span><b>Acesso do responsável</b>Outros usuários e permissões serão configurados depois.</span></div>}
      <div className="powered-by"><span>Operação Betão</span><i/>Mordomê <em>by JCS</em></div>
    </div></section>
  </div>;
}

function Salon({ state, onSelect }: { state: RestaurantState; onSelect: (id: number) => void }) {
  const [filter, setFilter] = useState<"Todas" | "Livres" | "Ocupadas">("Todas");
  const occupied = state.tables.filter(t => t.status !== "Livre").length;
  const visible = state.tables.filter(table => filter === "Todas" || (filter === "Livres" ? table.status === "Livre" : table.status !== "Livre"));
  return <div className="page-content"><div className="hero-row"><div><span className="section-kicker">Mapa operacional</span><p>Acompanhe mesas e comandas em tempo real.</p></div><button className="primary" onClick={() => onSelect(state.tables.find(t => t.status === "Livre")?.id ?? 1)}><Plus/> Nova comanda</button></div><div className="stats-row"><KpiCard icon={<LayoutGrid/>} value={state.tables.length} label="mesas no salão"/><KpiCard icon={<UtensilsCrossed/>} value={occupied} label="mesas ocupadas"/><KpiCard icon={<Clock3/>} value={state.tables.filter(t => t.status === "Fechamento").length} label="aguardando conta"/></div><div className="section-title section-title-rich"><div><span className="room-label">Ambiente 01</span><h2>Salão principal</h2></div><div className="table-filters">{(["Todas", "Livres", "Ocupadas"] as const).map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "Todas" ? state.tables.length : item === "Livres" ? state.tables.length - occupied : occupied}</span></button>)}</div></div><div className="tables-grid">{visible.map(table => <button key={table.id} className={`table-card ${table.status.toLowerCase()}`} onClick={() => onSelect(table.id)}><div className="table-top"><span>Mesa</span><b>{table.id.toString().padStart(2, "0")}</b><em>{table.seats} lugares</em></div><div className="table-icon"><UtensilsCrossed/></div><div className="table-meta"><span><i />{table.status}</span><small>{table.status === "Livre" ? "Disponível agora" : `${table.items.reduce((s, i) => s + i.quantity, 0)} itens • ${money(tableTotal(table))}`}</small></div></button>)}</div></div>;
}

function Pos({ onFinish }: { onFinish: (items: OrderItem[], payment: string) => void }) {
  const [cart, setCart] = useState<OrderItem[]>([]); const [query, setQuery] = useState(""); const [payment, setPayment] = useState("Pix"); const [category, setCategory] = useState("Todos");
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const add = (product: typeof products[number]) => setCart(current => { const found = current.find(item => item.id === product.id); return found ? current.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }]; });
  const change = (id: string, delta: number) => setCart(current => current.map(item => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter(item => item.quantity > 0));
  const categories = ["Todos", ...new Set(products.map(product => product.category))];
  const visibleProducts = products.filter(p => (category === "Todos" || p.category === category) && p.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="pos-layout"><section className="pos-products"><div className="pos-intro"><div><span className="section-kicker">Balcão</span><h2>Venda direta</h2><p>Escolha os produtos e receba. Sem mesa, sem comanda.</p></div><div className="search"><Search/><input placeholder="Buscar produto..." value={query} onChange={e => setQuery(e.target.value)}/><kbd>F2</kbd></div></div><div className="pos-category-bar">{categories.map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="pos-product-grid">{visibleProducts.map(product => <button key={product.id} className="pos-product" onClick={() => add(product)}><span>{product.emoji}</span><div><small>{product.category}</small><b>{product.name}</b><strong>{money(product.price)}</strong></div><Plus/></button>)}</div></section><aside className="pos-cart"><div className="pos-cart-head"><div><span>VENDA ATUAL</span><h2>{cart.reduce((sum, item) => sum + item.quantity, 0)} {cart.length === 1 && cart[0].quantity === 1 ? "item" : "itens"}</h2></div>{cart.length > 0 && <button onClick={() => setCart([])}>Limpar</button>}</div><div className="pos-cart-items">{cart.length === 0 ? <div className="empty"><ShoppingBag/><b>Nenhum produto</b><span>Toque em um produto para começar a venda.</span></div> : cart.map(item => <div className="pos-cart-row" key={item.id}><span className="food">{item.emoji}</span><div><b>{item.name}</b><small>{money(item.price * item.quantity)}</small></div><div className="stepper"><button onClick={() => change(item.id, -1)}><Minus/></button><b>{item.quantity}</b><button onClick={() => change(item.id, 1)}><Plus/></button></div></div>)}</div><div className="pos-payment"><label>Receber com<select value={payment} onChange={e => setPayment(e.target.value)}><option>Pix</option><option>Cartão de crédito</option><option>Cartão de débito</option><option>Dinheiro</option></select></label><div className="pos-total"><span>Total da venda</span><b>{money(total)}</b></div><button className="primary wide" disabled={!cart.length} onClick={() => { onFinish(cart, payment); setCart([]); }}><CircleDollarSign/> Finalizar venda</button><small className="shortcut-hint">Atalho: pressione <kbd>F8</kbd> para finalizar</small></div></aside></div>;
}

function Command({ table, search, setSearch, onBack, onAdd, onQuantity, onSend, onClose }: { table: RestaurantState["tables"][number]; search: string; setSearch: (v: string) => void; onBack: () => void; onAdd: (p: typeof products[number]) => void; onQuantity: (id: string, delta: number) => void; onSend: () => void; onClose: (payment: string) => void }) {
  const [category, setCategory] = useState("Todos"); const [checkout, setCheckout] = useState(false);
  const categories = ["Todos", ...new Set(products.map(p => p.category))];
  const visible = products.filter(p => (category === "Todos" || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase()));
  const total = tableTotal(table); const service = total * .1;
  return <div className="command-layout"><section className="catalog"><button className="back" onClick={onBack}><ChevronLeft/> Voltar ao salão</button><div className="search"><Search/><input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}/></div><div className="chips">{categories.map(c => <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="product-grid">{visible.map(product => <button className="product-card" key={product.id} onClick={() => onAdd(product)}><span>{product.emoji}</span><div><small>{product.category}</small><b>{product.name}</b><strong>{money(product.price)}</strong></div><Plus/></button>)}</div></section><aside className="ticket"><div className="ticket-title"><div><span>COMANDA</span><h2>Mesa {table.id.toString().padStart(2, "0")}</h2></div><span className="status-badge">{table.orderStatus ?? "Aberta"}</span></div><div className="ticket-items">{table.items.length === 0 ? <div className="empty"><ShoppingBag/><b>Comanda vazia</b><span>Toque em um produto para adicionar.</span></div> : table.items.map(item => <div className="ticket-item" key={item.id}><span className="food">{item.emoji}</span><div><b>{item.name}</b><small>{money(item.price)}</small></div><div className="stepper"><button onClick={() => onQuantity(item.id, -1)}>{item.quantity === 1 ? <X/> : <Minus/>}</button><b>{item.quantity}</b><button onClick={() => onQuantity(item.id, 1)}><Plus/></button></div></div>)}</div><div className="ticket-footer"><div><span>Subtotal</span><b>{money(total)}</b></div><div><span>Serviço (10%)</span><b>{money(service)}</b></div><div className="grand"><span>Total</span><b>{money(total + service)}</b></div>{table.orderStatus ? <button className="secondary wide" onClick={() => setCheckout(true)}><CircleDollarSign/> Fechar conta</button> : <button className="primary wide" disabled={!table.items.length} onClick={onSend}><ChefHat/> Enviar para cozinha</button>}</div></aside>{checkout && <Checkout total={total + service} onCancel={() => setCheckout(false)} onConfirm={onClose}/>}</div>;
}
function Checkout({ total, onCancel, onConfirm }: { total: number; onCancel: () => void; onConfirm: (p: string) => void }) { const [payment, setPayment] = useState("Pix"); return <div className="modal-bg"><div className="modal"><button className="modal-close" onClick={onCancel}><X/></button><span className="modal-icon"><CircleDollarSign/></span><h2>Fechar conta</h2><p>Confirme o recebimento de <b>{money(total)}</b>.</p><label>Forma de pagamento<select value={payment} onChange={e => setPayment(e.target.value)}><option>Pix</option><option>Cartão de crédito</option><option>Cartão de débito</option><option>Dinheiro</option></select></label><button className="primary wide" onClick={() => onConfirm(payment)}>Confirmar pagamento</button></div></div>; }

function Kitchen({ tables, onStatus }: { tables: RestaurantState["tables"]; onStatus: (id: number, status: OrderStatus) => void }) {
  const orders = tables.filter(t => t.orderStatus && t.orderStatus !== "Entregue");
  const next: Record<string, OrderStatus> = { "Recebido": "Em preparo", "Em preparo": "Pronto", "Pronto": "Entregue" };
  return <div className="page-content"><div className="hero-row"><p>Pedidos organizados por etapa de preparo.</p><span className="live"><i/> Atualização ao vivo</span></div>{orders.length === 0 ? <div className="big-empty"><ChefHat/><h2>Tudo em dia por aqui</h2><p>Novos pedidos enviados pelo salão aparecerão nesta tela.</p></div> : <div className="kds-grid">{orders.map(order => <article className={`kds-card ${order.orderStatus?.replace(" ", "-").toLowerCase()}`} key={order.id}><div className="kds-head"><div><span>MESA</span><b>{order.id.toString().padStart(2, "0")}</b></div><span><Clock3/> agora</span></div><div className="kds-items">{order.items.map(item => <div key={item.id}><b>{item.quantity}×</b><span>{item.name}</span></div>)}</div><div className="kds-foot"><span>{order.orderStatus}</span><button onClick={() => onStatus(order.id, next[order.orderStatus!])}>{order.orderStatus === "Pronto" ? "Entregar" : order.orderStatus === "Em preparo" ? "Marcar pronto" : "Iniciar preparo"}</button></div></article>)}</div>}</div>;
}
function Summary({ state, revenue, ongoing }: { state: RestaurantState; revenue: number; ongoing: number }) {
  const average = state.sales.length ? revenue / state.sales.length : 0;
  const ranking = useMemo(() => products.slice(0, 3).map((p, i) => ({ ...p, count: Math.max(0, state.sales.length * (3 - i)) })), [state.sales.length]);
  return <div className="page-content"><div className="hero-row"><div><span className="section-kicker">Pulso do negócio</span><p>Uma visão clara do desempenho de hoje.</p></div><button className="date-button">Hoje, {new Date().toLocaleDateString("pt-BR")}</button></div><div className="metric-grid"><MetricCard label="Vendas do dia" value={money(revenue)} note={`${state.sales.length} vendas finalizadas`} icon={<CircleDollarSign/>}/><MetricCard label="Pedidos em andamento" value={ongoing.toString()} note="no salão e cozinha" icon={<ChefHat/>}/><MetricCard label="Ticket médio" value={money(average)} note="por venda finalizada" icon={<BarChart3/>}/></div><div className="summary-grid"><section className="panel"><h2>Vendas recentes</h2>{state.sales.length === 0 ? <div className="empty small"><CircleDollarSign/><b>Nenhuma venda ainda</b><span>Finalize uma venda para vê-la aqui.</span></div> : state.sales.slice().reverse().map(sale => <div className="sale-row" key={sale.id}><div className="sale-icon">{sale.channel === "PDV" ? <ShoppingBag/> : <UtensilsCrossed/>}</div><div><b>{sale.channel === "PDV" ? "Venda rápida" : `Mesa ${sale.table?.toString().padStart(2, "0")}`}</b><span>{new Date(sale.closedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {sale.payment} • {sale.channel}</span></div><strong>{money(sale.total)}</strong></div>)}</section><section className="panel"><h2>Mais pedidos</h2>{ranking.map((item, index) => <div className="rank" key={item.id}><em>{index + 1}</em><span className="food">{item.emoji}</span><div><b>{item.name}</b><span>{item.count} vendidos</span></div></div>)}</section></div></div>;
}
function MobileNav({ view, setView }: { view: View; setView: (v: View) => void }) { return <nav className="mobile-nav"><button className={view === "pdv" ? "active" : ""} onClick={() => setView("pdv")}><ShoppingBag/>PDV</button><button className={view === "salão" ? "active" : ""} onClick={() => setView("salão")}><LayoutGrid/>Salão</button><button className={view === "cozinha" ? "active" : ""} onClick={() => setView("cozinha")}><ChefHat/>Cozinha</button><button className={view === "resumo" ? "active" : ""} onClick={() => setView("resumo")}><BarChart3/>Resumo</button></nav>; }
