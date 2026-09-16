"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/domain";
import { toDateInput } from "@/components/admin/PeriodFilter";
import { MetricCard } from "@/components/ui";
import { CircleDollarSign, Receipt, TrendingUp } from "lucide-react";

type Kpis = { revenue: number; salesCount: number; averageTicket: number };
type HourlyPoint = { hour: number; revenue: number; salesCount: number };
type ChannelPoint = { channel: string; revenue: number; salesCount: number };

const CHANNEL_LABELS: Record<string, string> = { POS: "PDV", FLOOR: "Salão", DELIVERY: "Delivery", ONLINE: "Online" };
// Paleta alinhada aos tokens de `app/globals.css` (--green/--green-2/--orange/--gold), evitando as
// cores padrão do recharts.
const CHANNEL_COLORS = ["#173f35", "#e97c4b", "#245e4d", "#c99a2e"];

function todayInput() { return toDateInput(new Date()); }
function yesterdayInput() { const date = new Date(); date.setDate(date.getDate() - 1); return toDateInput(date); }

export function SalesTrackingDashboard() {
  const [date, setDate] = useState(todayInput());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [channels, setChannels] = useState<ChannelPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/dashboards/sales-tracking?date=${date}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o dashboard.");
        if (cancelled) return;
        setKpis(data.kpis ?? null); setHourly(data.hourly ?? []); setChannels(data.channels ?? []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(() => { void load(); });
    return () => { cancelled = true; };
  }, [date]);

  const hasSales = (kpis?.salesCount ?? 0) > 0;

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Acompanhamento de vendas</span><h2>Dia</h2></div></div>
      <p className="section-note">Faturamento, horário de pico e composição por canal do dia escolhido, na unidade ativa.</p>
      <div className="field" style={{ maxWidth: 220 }}>
        <label htmlFor="sales-tracking-date">Data</label>
        <input id="sales-tracking-date" type="date" value={date} max={todayInput()} onChange={event => setDate(event.target.value)} />
      </div>
      <nav className="settings-tabs" aria-label="Atalhos de data">
        <button className={date === todayInput() ? "active" : ""} onClick={() => setDate(todayInput())}>Hoje</button>
        <button className={date === yesterdayInput() ? "active" : ""} onClick={() => setDate(yesterdayInput())}>Ontem</button>
      </nav>
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando dashboard…</span></div> : <>
      <section className="metric-grid">
        <MetricCard label="Faturamento do dia" value={money(kpis?.revenue ?? 0)} note={date === todayInput() ? "Hoje" : new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR")} icon={<CircleDollarSign />} />
        <MetricCard label="Vendas do dia" value={String(kpis?.salesCount ?? 0)} note="Concluídas ou parcialmente reembolsadas" icon={<Receipt />} />
        <MetricCard label="Ticket médio" value={money(kpis?.averageTicket ?? 0)} note="Faturamento líquido / vendas" icon={<TrendingUp />} />
      </section>

      {!hasSales ? <section className="panel settings-shell"><div className="empty"><span>Nenhuma venda registrada nesse dia ainda.</span></div></section> : <>
        <section className="panel settings-shell">
          <div className="settings-shell-header"><div><span className="section-kicker">Horário de pico</span><h2>Faturamento por hora</h2></div></div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hourly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="hour" tickFormatter={hour => `${hour}h`} fontSize={11} />
              <YAxis tickFormatter={value => money(Number(value))} fontSize={11} width={80} />
              <Tooltip formatter={value => money(Number(value))} labelFormatter={hour => `${hour}h às ${Number(hour) + 1}h`} />
              <Bar dataKey="revenue" fill="#173f35" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel settings-shell">
          <div className="settings-shell-header"><div><span className="section-kicker">Composição</span><h2>Vendas por canal</h2></div></div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={channels} dataKey="revenue" nameKey="channel" cx="50%" cy="45%" outerRadius={90}>
                {channels.map((entry, index) => <Cell key={entry.channel} fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value, _name, item) => { const point = item.payload as ChannelPoint; return [money(Number(value)), CHANNEL_LABELS[point.channel] ?? point.channel]; }} />
              <Legend formatter={(_value, entry) => { const point = (entry?.payload ?? {}) as ChannelPoint; return `${CHANNEL_LABELS[point.channel] ?? point.channel}: ${money(point.revenue)}`; }} />
            </PieChart>
          </ResponsiveContainer>
        </section>
      </>}
    </>}
  </>;
}
