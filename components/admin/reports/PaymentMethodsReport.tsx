"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/domain";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";

type Row = { method: string; methodLabel: string; paymentsCount: number; totalAmount: number; share: number };
type Summary = { paymentsCount: number; totalAmount: number };

const percent = (value: number) => `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const columns: ReportColumn[] = [
  { key: "methodLabel", label: "Forma de pagamento" },
  { key: "paymentsCount", label: "Qtde. de pagamentos", align: "right" },
  { key: "totalAmount", label: "Valor total recebido", align: "right", format: value => money(Number(value)) },
  { key: "share", label: "% de participação", align: "right", format: value => percent(Number(value)) },
];

// Relatório "Vendas por forma de pagamento" (ADR 0035): agrupa PAGAMENTOS individuais (não vendas)
// das vendas concluídas no período por forma de pagamento — uma venda com split (mais de um
// pagamento) contribui para cada forma envolvida. Ordenado por valor total recebido decrescente,
// com resumo de total geral e participação percentual de cada forma.
export function PaymentMethodsReport() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ paymentsCount: 0, totalAmount: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports/payment-methods?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o relatório.");
        if (cancelled) return;
        setRows(data.rows ?? []);
        setSummary(data.summary ?? { paymentsCount: 0, totalAmount: 0 });
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
    { key: "paymentsCount", label: "Total de pagamentos", value: String(summary.paymentsCount) },
    { key: "totalAmount", label: "Total geral recebido", value: money(summary.totalAmount) },
  ];

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Vendas por forma de pagamento</span><h2>Período</h2></div></div>
      <p className="section-note">Agrupa os pagamentos das vendas concluídas no período por forma de pagamento (Pix, cartão, dinheiro). Uma venda com mais de um pagamento (split) contribui para cada forma envolvida, pelo valor daquele pagamento.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <ReportTable
      title="Vendas por forma de pagamento"
      subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
      columns={columns}
      rows={rows}
      footer={rows.length > 0 ? footer : undefined}
      exportFileBaseName={`vendas-por-forma-de-pagamento-${from}-a-${to}`}
      emptyMessage="Nenhum pagamento no período selecionado."
    />}
  </>;
}
