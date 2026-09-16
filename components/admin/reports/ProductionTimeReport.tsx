"use client";

import { useEffect, useState } from "react";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";

type Row = { orderId: string; orderLabel: string; tableLabel: string | null; sentAt: string; readyAt: string; durationSeconds: number };
type Summary = { ordersCount: number; averageDurationSeconds: number; inProgressCount: number };

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}min ${seconds}s` : `${minutes}min`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const columns: ReportColumn[] = [
  { key: "orderLabel", label: "Pedido" },
  { key: "tableLabel", label: "Mesa", format: value => String(value ?? "—") },
  { key: "sentAt", label: "Enviado à cozinha", format: value => formatTime(String(value)) },
  { key: "readyAt", label: "Pronto", format: value => formatTime(String(value)) },
  { key: "durationSeconds", label: "Tempo de produção", align: "right", format: value => formatDuration(Number(value)) },
];

// Relatório "Tempo de produção" (ADR 0039): para cada pedido enviado à cozinha no período, mede o
// tempo entre o envio (`sentAt`) e o pedido ficar pronto (primeiro READY do histórico de status).
// Pedidos que nunca chegaram a READY no período (ainda em preparo, ou cancelados antes de ficar
// prontos) não entram na tabela nem no tempo médio — o resumo informa quantos ficaram de fora
// ("ainda em andamento / não concluídos"), sem escondê-los silenciosamente. Compartilha a mesma
// extração de dados brutos de histórico de status do relatório "Tempo por status"
// (`lib/reports/order-timing.ts`).
export function ProductionTimeReport() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ ordersCount: 0, averageDurationSeconds: 0, inProgressCount: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports/production-time?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o relatório.");
        if (cancelled) return;
        setRows(data.rows ?? []);
        setSummary(data.summary ?? { ordersCount: 0, averageDurationSeconds: 0, inProgressCount: 0 });
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
    { key: "ordersCount", label: "Pedidos concluídos no período", value: String(summary.ordersCount) },
    { key: "averageDurationSeconds", label: "Tempo médio de produção", value: formatDuration(summary.averageDurationSeconds) },
    { key: "inProgressCount", label: "Ainda em andamento / não concluídos no período", value: String(summary.inProgressCount) },
  ];

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Tempo de produção</span><h2>Período</h2></div></div>
      <p className="section-note">Tempo entre o pedido ser enviado à cozinha e ficar pronto, por pedido, com tempo médio de produção do período. Pedidos ainda em preparo ou cancelados antes de ficar prontos não entram no cálculo (contados à parte, no rodapé).</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <ReportTable
      title="Tempo de produção"
      subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
      columns={columns}
      rows={rows}
      footer={rows.length > 0 ? footer : undefined}
      exportFileBaseName={`tempo-de-producao-${from}-a-${to}`}
      emptyMessage="Nenhum pedido concluído (com status Pronto) no período selecionado."
    />}
  </>;
}
