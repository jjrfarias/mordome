"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/domain";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";

type Row = { id: string; completedAt: string; channel: string; table: number | null; payment: string; gross: number; discount: number; net: number };
type Summary = { count: number; totalGross: number; totalDiscount: number; totalNet: number; averageTicket: number };

const channelLabel: Record<string, string> = { POS: "PDV", FLOOR: "Salão", DELIVERY: "Delivery" };

const columns: ReportColumn[] = [
  { key: "completedAt", label: "Data/hora", format: value => new Date(String(value)).toLocaleString("pt-BR") },
  { key: "channel", label: "Canal", format: value => channelLabel[String(value)] ?? String(value) },
  { key: "table", label: "Mesa", format: value => (value === null || value === undefined ? "—" : String(value)) },
  { key: "payment", label: "Forma de pagamento", format: value => String(value || "—") },
  { key: "gross", label: "Valor bruto", align: "right", format: value => money(Number(value)) },
  { key: "discount", label: "Desconto", align: "right", format: value => money(Number(value)) },
  { key: "net", label: "Valor líquido", align: "right", format: value => money(Number(value)) },
];

export function SalesByPeriodReport() {
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
        const response = await fetch(`/api/admin/reports/sales-by-period?from=${from}&to=${to}`, { cache: "no-store" });
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
      <div className="settings-shell-header"><div><span className="section-kicker">Vendas por período</span><h2>Período</h2></div></div>
      <p className="section-note">Vendas concluídas (inclusive parcialmente reembolsadas) no período selecionado.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <>
      {summary && <section className="panel settings-shell">
        <div className="metric-cards">
          <div className="role-card"><b>Vendas</b><p className="section-note">{summary.count}</p></div>
          <div className="role-card"><b>Valor bruto</b><p className="section-note">{money(summary.totalGross)}</p></div>
          <div className="role-card"><b>Descontos</b><p className="section-note">{money(summary.totalDiscount)}</p></div>
          <div className="role-card"><b>Valor líquido</b><p className="section-note">{money(summary.totalNet)}</p></div>
          <div className="role-card"><b>Ticket médio</b><p className="section-note">{money(summary.averageTicket)}</p></div>
        </div>
      </section>}
      <ReportTable
        title="Vendas por período"
        subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
        columns={columns}
        rows={rows}
        exportFileBaseName={`vendas-por-periodo-${from}-a-${to}`}
        footer={summary ? [
          { key: "count", label: "Vendas", value: String(summary.count) },
          { key: "net", label: "Valor líquido total", value: money(summary.totalNet) },
          { key: "avg", label: "Ticket médio", value: money(summary.averageTicket) },
        ] : undefined}
      />
    </>}
  </>;
}
