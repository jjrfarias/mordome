"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/domain";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { MetricCard } from "@/components/ui";
import { CircleDollarSign } from "lucide-react";

type ChannelKpi = { channel: string; revenue: number; salesCount: number; share: number };
type ChannelPoint = { date: string; [channel: string]: number | string };

const CHANNEL_LABELS: Record<string, string> = { POS: "PDV", FLOOR: "Salão", DELIVERY: "Delivery", ONLINE: "Online" };
// Mesma paleta alinhada aos tokens de `app/globals.css` já usada em `SalesTrackingDashboard.tsx`.
const CHANNEL_COLORS = ["#173f35", "#e97c4b", "#245e4d", "#c99a2e"];
const percent = (value: number) => `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Dashboard "Canais" (ADR 0043): análise dos canais de venda (POS/FLOOR/DELIVERY/ONLINE) ao longo
// de um INTERVALO de dias, diferente do gráfico de pizza de UM dia já embutido em "Acompanhamento
// de vendas". Usa `PeriodFilter` (De/Até + atalhos), não o seletor de data única dos outros dois
// dashboards, já que aqui a análise só faz sentido sobre vários dias.
export function ChannelsDashboard() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kpis, setKpis] = useState<ChannelKpi[]>([]);
  const [ranking, setRanking] = useState<ChannelKpi[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [points, setPoints] = useState<ChannelPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/dashboards/channels?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o dashboard.");
        if (cancelled) return;
        setKpis(data.kpis ?? []); setRanking(data.ranking ?? []); setChannels(data.channels ?? []); setPoints(data.points ?? []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(() => { void load(); });
    return () => { cancelled = true; };
  }, [from, to]);

  const hasSales = kpis.length > 0;

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Canais</span><h2>Período</h2></div></div>
      <p className="section-note">Compara os canais de venda ao longo do período escolhido: evolução diária, participação e ranking por faturamento.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando dashboard…</span></div> : <>
      {!hasSales ? <section className="panel settings-shell"><div className="empty"><span>Nenhuma venda registrada nesse período ainda.</span></div></section> : <>
        <section className="metric-grid">
          {kpis.map((kpi, index) => <MetricCard
            key={kpi.channel}
            label={CHANNEL_LABELS[kpi.channel] ?? kpi.channel}
            value={money(kpi.revenue)}
            note={`${percent(kpi.share)} de participação · ${kpi.salesCount} venda(s)`}
            icon={<CircleDollarSign color={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} />}
          />)}
        </section>

        <section className="panel settings-shell">
          <div className="settings-shell-header"><div><span className="section-kicker">Evolução</span><h2>Faturamento por dia e canal</h2></div></div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="date" tickFormatter={date => new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} fontSize={11} />
              <YAxis tickFormatter={value => money(Number(value))} fontSize={11} width={80} />
              <Tooltip formatter={(value, name) => [money(Number(value)), CHANNEL_LABELS[String(name)] ?? String(name)]} labelFormatter={date => new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR")} />
              <Legend formatter={value => CHANNEL_LABELS[value] ?? value} />
              {channels.map((channel, index) => <Bar key={channel} dataKey={channel} stackId="channels" fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} radius={index === channels.length - 1 ? [4, 4, 0, 0] : undefined} />)}
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel settings-shell">
          <div className="settings-shell-header"><div><span className="section-kicker">Ranking</span><h2>Canais por faturamento</h2></div></div>
          <div className="inventory-list">
            {ranking.map((channel, index) => <div className="inventory-row" key={channel.channel}>
              <b>{index + 1}º</b>
              <span>{CHANNEL_LABELS[channel.channel] ?? channel.channel}</span>
              <span>{channel.salesCount} venda(s)</span>
              <span>{percent(channel.share)}</span>
              <strong>{money(channel.revenue)}</strong>
            </div>)}
          </div>
        </section>
      </>}
    </>}
  </>;
}
