"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/domain";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";

type Row = { date: string; salesCount: number; gross: number; discount: number; net: number };
type Summary = { salesCount: number; gross: number; discount: number; net: number };

const columns: ReportColumn[] = [
  { key: "date", label: "Data", format: value => new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") },
  { key: "salesCount", label: "Qtde. de vendas", align: "right" },
  { key: "gross", label: "Faturamento bruto", align: "right", format: value => money(Number(value)) },
  { key: "discount", label: "Descontos", align: "right", format: value => money(Number(value)) },
  { key: "net", label: "Faturamento líquido", align: "right", format: value => money(Number(value)) },
];

export function RevenueByDayReport() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports/revenue-by-day?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o relatório.");
        if (cancelled) return;
        setRows(data.rows ?? []); setSummary(data.summary ?? null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o relatório.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(() => { void load(); });
    return () => { cancelled = true; };
  }, [from, to]);

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Faturamento por dia</span><h2>Período</h2></div></div>
      <p className="section-note">Vendas concluídas (inclusive parcialmente reembolsadas) agrupadas por dia, em ordem cronológica.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <>
      {summary && <section className="panel settings-shell">
        <div className="metric-cards">
          <div className="role-card"><b>Vendas</b><p className="section-note">{summary.salesCount}</p></div>
          <div className="role-card"><b>Faturamento bruto</b><p className="section-note">{money(summary.gross)}</p></div>
          <div className="role-card"><b>Descontos</b><p className="section-note">{money(summary.discount)}</p></div>
          <div className="role-card"><b>Faturamento líquido</b><p className="section-note">{money(summary.net)}</p></div>
        </div>
      </section>}
      <ReportTable
        title="Faturamento por dia"
        subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
        columns={columns}
        rows={rows}
        exportFileBaseName={`faturamento-por-dia-${from}-a-${to}`}
        footer={summary ? [
          { key: "count", label: "Total de vendas", value: String(summary.salesCount) },
          { key: "net", label: "Faturamento líquido total", value: money(summary.net) },
        ] : undefined}
      />
    </>}
  </>;
}
