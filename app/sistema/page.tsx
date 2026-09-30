"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Building2, LogOut, Plus, RefreshCw, ShieldCheck, Store, Users } from "lucide-react";
import styles from "./system.module.css";

type AdminSession = { admin: { name: string; username: string } };
type Tenant = { id: string; name: string; slug: string; active: boolean; createdAt: string; establishments: number; users: number; activeSessions: number; salesThisMonth: number; revenueThisMonth: number; deliveryOrdersThisMonth: number; openTabs: number };

export default function SystemPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadTenants = useCallback(async () => {
    const response = await fetch("/api/system/tenants", { cache: "no-store" });
    if (response.ok) setTenants((await response.json()).tenants);
  }, []);

  useEffect(() => { void (async () => {
    const response = await fetch("/api/system/auth/session", { cache: "no-store" });
    const payload = await response.json(); setSession(payload.session); setChecked(true);
    if (payload.session) await loadTenants();
  })(); }, [loadTenants]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/system/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const payload = await response.json();
    if (!response.ok) setError(payload.error); else { const status = await fetch("/api/system/auth/session"); setSession((await status.json()).session); await loadTenants(); }
    setLoading(false);
  }

  async function logout() { await fetch("/api/system/auth/logout", { method: "POST" }); setSession(null); setTenants([]); }
  if (!checked) return <main className={styles.center}>Carregando…</main>;
  if (!session) return <SystemLogin onSubmit={login} loading={loading} error={error}/>;
  return <SystemDashboard session={session} tenants={tenants} reload={loadTenants} logout={logout}/>;
}

function SystemLogin({ onSubmit, loading, error }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; loading: boolean; error: string }) {
  return <main className={styles.loginPage}><section className={styles.loginCard}>
    <div className={styles.badge}><ShieldCheck/> Administração da plataforma</div>
    <h1>Mordomê Sistema</h1><p>Acesso reservado à equipe responsável pela operação SaaS.</p>
    <form onSubmit={onSubmit}><label>Usuário<input name="username" autoComplete="username" required/></label><label>Senha<input name="password" type="password" autoComplete="current-password" required/></label>{error && <div className={styles.error}>{error}</div>}<button disabled={loading}>{loading ? "Entrando…" : "Entrar no painel"}</button></form>
  </section></main>;
}

function SystemDashboard({ session, tenants, reload, logout }: { session: AdminSession; tenants: Tenant[]; reload: () => Promise<void>; logout: () => Promise<void> }) {
  const [creating, setCreating] = useState(false); const [message, setMessage] = useState(""); const [busy, setBusy] = useState("");
  const totals = useMemo(() => ({ active: tenants.filter(item => item.active).length, users: tenants.reduce((sum, item) => sum + item.users, 0), sales: tenants.reduce((sum, item) => sum + item.salesThisMonth, 0), revenue: tenants.reduce((sum, item) => sum + item.revenueThisMonth, 0) }), [tenants]);
  async function createTenant(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy("create"); setMessage(""); const form = event.currentTarget; const response = await fetch("/api/system/tenants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) }); const payload = await response.json(); if (response.ok) { form.reset(); setCreating(false); setMessage("Tenant criado com sucesso."); await reload(); } else setMessage(payload.error); setBusy(""); }
  async function toggleTenant(tenant: Tenant) { const reason = window.prompt(`Informe o motivo para ${tenant.active ? "bloquear" : "liberar"} ${tenant.name}:`); if (!reason) return; setBusy(tenant.id); const response = await fetch("/api/system/tenants", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: tenant.id, active: !tenant.active, reason }) }); const payload = await response.json(); setMessage(response.ok ? `Tenant ${tenant.active ? "bloqueado" : "liberado"}.` : payload.error); if (response.ok) await reload(); setBusy(""); }
  return <main className={styles.shell}>
    <header><div><span className={styles.eyebrow}>ADMINISTRAÇÃO DA PLATAFORMA</span><h1>Visão geral dos tenants</h1><p>Uso, acessos e situação operacional em um único lugar.</p></div><div className={styles.headerActions}><span>{session.admin.name}<small>@{session.admin.username}</small></span><button className={styles.secondary} onClick={() => void reload()}><RefreshCw/> Atualizar</button><button className={styles.secondary} onClick={() => void logout()}><LogOut/> Sair</button></div></header>
    <section className={styles.stats}><Stat icon={<Building2/>} label="Tenants ativos" value={`${totals.active}/${tenants.length}`}/><Stat icon={<Users/>} label="Usuários" value={String(totals.users)}/><Stat icon={<Activity/>} label="Vendas no mês" value={String(totals.sales)}/><Stat icon={<Store/>} label="Receita no mês" value={totals.revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/></section>
    <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Tenants</h2><p>Bloquear um tenant encerra suas sessões e impede novos acessos.</p></div><button onClick={() => setCreating(value => !value)}><Plus/> Novo tenant</button></div>
      {creating && <form className={styles.createForm} onSubmit={createTenant}><label>Empresa<input name="organizationName" required minLength={2}/></label><label>Primeira unidade<input name="establishmentName" required minLength={2}/></label><label>Nome do proprietário<input name="ownerName" required minLength={2}/></label><label>Usuário inicial<input name="ownerUsername" required minLength={3}/></label><label>Senha inicial<input name="ownerPassword" type="password" required minLength={8}/></label><button disabled={busy === "create"}>{busy === "create" ? "Criando…" : "Criar tenant"}</button></form>}
      {message && <div className={styles.notice}>{message}</div>}
      <div className={styles.tableWrap}><table><thead><tr><th>Tenant</th><th>Situação</th><th>Estrutura</th><th>Consumo no mês</th><th>Sessões</th><th></th></tr></thead><tbody>{tenants.map(tenant => <tr key={tenant.id}><td><b>{tenant.name}</b><small>{tenant.slug}</small></td><td><span className={tenant.active ? styles.active : styles.blocked}>{tenant.active ? "Ativo" : "Bloqueado"}</span></td><td>{tenant.establishments} unidade(s)<small>{tenant.users} usuário(s)</small></td><td>{tenant.salesThisMonth} vendas · {tenant.revenueThisMonth.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}<small>{tenant.deliveryOrdersThisMonth} delivery · {tenant.openTabs} comandas abertas</small></td><td>{tenant.activeSessions}</td><td><button className={tenant.active ? styles.danger : styles.release} disabled={busy === tenant.id} onClick={() => void toggleTenant(tenant)}>{tenant.active ? "Bloquear" : "Liberar"}</button></td></tr>)}</tbody></table></div>
    </section>
  </main>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <article className={styles.stat}><div>{icon}</div><span>{label}</span><b>{value}</b></article>; }
