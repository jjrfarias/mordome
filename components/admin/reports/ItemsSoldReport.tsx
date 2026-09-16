"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/domain";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";

type Row = { rank: number; productName: string; quantity: number; revenue: number; averagePrice: number };
type Summary = { quantity: number; revenue: number };

const columns: ReportColumn[] = [
  { key: "rank", label: "Posição", align: "right" },
  { key: "productName", label: "Produto" },
  { key: "quantity", label: "Quantidade vendida", align: "right" },
  { key: "revenue", label: "Receita total", align: "right", format: value => money(Number(value)) },
  { key: "averagePrice", label: "Preço médio", align: "right", format: value => money(Number(value)) },
];

// Relatório "Itens vendidos" (ADR 0037): ranking de produtos mais vendidos no período por
// faturamento, agrupando os itens (`SaleItem`) das vendas concluídas por produto — quantidade total
// vendida, receita total (soma bruta de quantidade × preço unitário, sem descontar reembolso) e
// preço médio praticado (receita total / quantidade). Ordenado por receita total decrescente.
export function ItemsSoldReport() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ quantity: 0, revenue: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports/items-sold?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o relatório.");
        if (cancelled) return;
        setRows(data.rows ?? []);
        setSummary(data.summary ?? { quantity: 0, revenue: 0 });
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o relatório.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(() => { void load(); });
    return () => { cancelled = true; };
  }, [from, to]);

  const footer = [
    { key: "quantity", label: "Quantidade total vendida", value: String(summary.quantity) },
    { key: "revenue", label: "Receita total", value: money(summary.revenue) },
  ];

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Itens vendidos</span><h2>Período</h2></div></div>
      <p className="section-note">Ranking de produtos mais vendidos no período por faturamento, com quantidade total vendida, receita total e preço médio praticado.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <ReportTable
      title="Itens vendidos"
      subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
      columns={columns}
      rows={rows}
      footer={rows.length > 0 ? footer : undefined}
      exportFileBaseName={`itens-vendidos-${from}-a-${to}`}
      emptyMessage="Nenhum item vendido no período selecionado."
    />}
  </>;
}
