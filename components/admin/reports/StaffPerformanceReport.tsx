"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/domain";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";

type Row = { operatorId: string; operatorName: string; role: "ATTENDANT" | "WAITER"; salesCount: number; totalNet: number; averageTicket: number };

const columns: ReportColumn[] = [
  { key: "operatorName", label: "Nome" },
  { key: "salesCount", label: "Qtde. de vendas", align: "right" },
  { key: "totalNet", label: "Valor total vendido", align: "right", format: value => money(Number(value)) },
  { key: "averageTicket", label: "Ticket médio", align: "right", format: value => money(Number(value)) },
];

// Relatório "Desempenho por atendente/garçom" (ADR 0034): ranking de vendas por pessoa, separado em
// duas seções (Atendentes = canal PDV, Garçons = canal Salão) porque a mesma pessoa pode operar os
// dois canais no período. Apenas uma VISÃO de desempenho — não calcula comissão (ver Acertos, ADR
// 0018, para isso).
export function StaffPerformanceReport() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports/staff-performance?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o relatório.");
        if (cancelled) return;
        setRows(data.rows ?? []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o relatório.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(() => { void load(); });
    return () => { cancelled = true; };
  }, [from, to]);

  const attendants = rows.filter(row => row.role === "ATTENDANT");
  const waiters = rows.filter(row => row.role === "WAITER");

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Desempenho por atendente/garçom</span><h2>Período</h2></div></div>
      <p className="section-note">Ranking de vendas por pessoa no período, por valor líquido total vendido (descontando reembolsos). Não é um cálculo de comissão — para isso, use Financeiro → Acertos.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <>
      <ReportTable
        title="Atendentes (PDV)"
        subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
        columns={columns}
        rows={attendants}
        exportFileBaseName={`desempenho-atendentes-${from}-a-${to}`}
        emptyMessage="Nenhuma venda de PDV no período selecionado."
      />
      <ReportTable
        title="Garçons (Salão)"
        subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
        columns={columns}
        rows={waiters}
        exportFileBaseName={`desempenho-garcons-${from}-a-${to}`}
        emptyMessage="Nenhuma venda de Salão no período selecionado."
      />
    </>}
  </>;
}
