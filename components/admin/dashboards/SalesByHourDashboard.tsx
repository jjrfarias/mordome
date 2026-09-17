"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/domain";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { MetricCard } from "@/components/ui";
import { Clock, TrendingUp } from "lucide-react";

type HourlyAveragePoint = { hour: number; totalRevenue: number; averageRevenue: number; salesCount: number };
type Kpis = { peakHour: number | null; peakAverageRevenue: number; daysObserved: number };

// Dashboard "Vendas por Data/Hora" (ADR 0043): drill-down mais granular que "Acompanhamento de
// vendas" (que só olha a hora de UM dia). Aqui o dono escolhe um INTERVALO de dias (`PeriodFilter`)
// e vê a média de faturamento por hora do dia, calculada sobre todos os dias do período — em vez
// de um heatmap dia da semana × hora (abordagem descartada por complexidade em `recharts`, que não
// tem componente de heatmap nativo; ver ADR 0043 para a justificativa completa).
export function SalesByHourDashboard() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hourly, setHourly] = useState<HourlyAveragePoint[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/dashboards/sales-by-hour?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o dashboard.");
        if (cancelled) return;
        setHourly(data.hourly ?? []); setKpis(data.kpis ?? null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(() => { void load(); });
    return () => { cancelled = true; };
  }, [from, to]);

  const hasSales = (kpis?.daysObserved ?? 0) > 0;

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Vendas por Data/Hora</span><h2>Período</h2></div></div>
      <p className="section-note">Faturamento médio por horário do dia, calculado sobre todos os dias do período — para identificar padrões recorrentes de horário de pico.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando dashboard…</span></div> : <>
      {!hasSales ? <section className="panel settings-shell"><div className="empty"><span>Nenhuma venda registrada nesse período ainda.</span></div></section> : <>
        <section className="metric-grid">
          <MetricCard
            label="Horário de pico médio"
            value={kpis?.peakHour !== null && kpis?.peakHour !== undefined ? `${kpis.peakHour}h` : "—"}
            note="Maior faturamento médio por hora no período"
            icon={<Clock />}
          />
          <MetricCard label="Faturamento médio no pico" value={money(kpis?.peakAverageRevenue ?? 0)} note="Média por dia, na hora de pico" icon={<TrendingUp />} />
          <MetricCard label="Dias observados" value={String(kpis?.daysObserved ?? 0)} note="Dias com pelo menos uma venda no período" icon={<Clock />} />
        </section>

        <section className="panel settings-shell">
          <div className="settings-shell-header"><div><span className="section-kicker">Padrão de horário</span><h2>Faturamento médio por hora</h2></div></div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hourly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="hour" tickFormatter={hour => `${hour}h`} fontSize={11} />
              <YAxis tickFormatter={value => money(Number(value))} fontSize={11} width={80} />
              <Tooltip formatter={(value, name) => [money(Number(value)), name === "averageRevenue" ? "Média por dia" : "Total no período"]} labelFormatter={hour => `${hour}h às ${Number(hour) + 1}h`} />
              <Bar dataKey="averageRevenue" fill="#173f35" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </>}
    </>}
  </>;
}
