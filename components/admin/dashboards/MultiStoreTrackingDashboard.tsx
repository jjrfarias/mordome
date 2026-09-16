"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/domain";
import { toDateInput } from "@/components/admin/PeriodFilter";
import { MetricCard } from "@/components/ui";
import { CircleDollarSign, Receipt, TrendingUp } from "lucide-react";

type Kpis = { totalRevenue: number; totalSalesCount: number; averageTicket: number };
type StorePoint = { establishmentId: string; establishmentName: string; revenue: number; salesCount: number; averageTicket: number };

function todayInput() { return toDateInput(new Date()); }
function yesterdayInput() { const date = new Date(); date.setDate(date.getDate() - 1); return toDateInput(date); }

export function MultiStoreTrackingDashboard() {
  const [date, setDate] = useState(todayInput());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [stores, setStores] = useState<StorePoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/dashboards/multi-store-tracking?date=${date}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o dashboard.");
        if (cancelled) return;
        setKpis(data.kpis ?? null); setStores(data.stores ?? []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(() => { void load(); });
    return () => { cancelled = true; };
  }, [date]);

  const ranking = [...stores].sort((a, b) => b.revenue - a.revenue);
  const hasAnySale = stores.some(store => store.salesCount > 0);

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Acompanhamento de vendas multilojas</span><h2>Dia</h2></div></div>
      <p className="section-note">Faturamento consolidado do dia entre as unidades que você tem acesso.</p>
      <div className="field" style={{ maxWidth: 220 }}>
        <label htmlFor="multi-store-date">Data</label>
        <input id="multi-store-date" type="date" value={date} max={todayInput()} onChange={event => setDate(event.target.value)} />
      </div>
      <nav className="settings-tabs" aria-label="Atalhos de data">
        <button className={date === todayInput() ? "active" : ""} onClick={() => setDate(todayInput())}>Hoje</button>
        <button className={date === yesterdayInput() ? "active" : ""} onClick={() => setDate(yesterdayInput())}>Ontem</button>
      </nav>
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando dashboard…</span></div> : <>
      <section className="metric-grid">
        <MetricCard label="Faturamento total do dia" value={money(kpis?.totalRevenue ?? 0)} note={`${stores.length} unidade(s)`} icon={<CircleDollarSign />} />
        <MetricCard label="Vendas totais" value={String(kpis?.totalSalesCount ?? 0)} note="Concluídas ou parcialmente reembolsadas" icon={<Receipt />} />
        <MetricCard label="Ticket médio consolidado" value={money(kpis?.averageTicket ?? 0)} note="Faturamento total / vendas totais" icon={<TrendingUp />} />
      </section>

      {stores.length === 0 ? <section className="panel settings-shell"><div className="empty"><span>Nenhuma unidade disponível para consolidar.</span></div></section> : <>
        {!hasAnySale && <section className="panel settings-shell"><div className="empty"><span>Nenhuma unidade vendeu nesse dia ainda.</span></div></section>}

        <section className="panel settings-shell">
          <div className="settings-shell-header"><div><span className="section-kicker">Comparativo</span><h2>Faturamento por unidade</h2></div></div>
          <ResponsiveContainer width="100%" height={Math.max(220, stores.length * 56)}>
            <BarChart data={ranking} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis type="number" tickFormatter={value => money(Number(value))} fontSize={11} />
              <YAxis type="category" dataKey="establishmentName" width={140} fontSize={12} />
              <Tooltip formatter={value => money(Number(value))} />
              <Bar dataKey="revenue" fill="#173f35" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel settings-shell">
          <div className="settings-shell-header"><div><span className="section-kicker">Ranking</span><h2>Unidades por faturamento</h2></div></div>
          <div className="inventory-list">
            {ranking.map((store, index) => <div className="inventory-row" key={store.establishmentId}>
              <b>{index + 1}º</b>
              <span>{store.establishmentName}</span>
              <span>{store.salesCount} venda(s)</span>
              <strong>{money(store.revenue)}</strong>
            </div>)}
          </div>
        </section>
      </>}
    </>}
  </>;
}
