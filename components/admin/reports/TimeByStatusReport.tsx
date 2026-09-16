"use client";

import { useEffect, useState } from "react";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";

type OrderStatusValue = "RECEIVED" | "PREPARING" | "READY";
const statusLabels: Record<OrderStatusValue, string> = { RECEIVED: "Recebido", PREPARING: "Em preparo", READY: "Pronto" };

type Row = { status: OrderStatusValue; averageDurationSeconds: number; ordersCount: number };

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}min ${seconds}s` : `${minutes}min`;
}

const columns: ReportColumn[] = [
  { key: "status", label: "Status", format: value => statusLabels[value as OrderStatusValue] ?? String(value) },
  { key: "averageDurationSeconds", label: "Tempo médio nesse status", align: "right", format: value => formatDuration(Number(value)) },
  { key: "ordersCount", label: "Nº de pedidos", align: "right" },
];

// Relatório "Tempo por status" (ADR 0039): tempo médio agregado (não por pedido, mas uma média
// geral por status) que os pedidos passam em cada etapa da cozinha no período — Recebido até virar
// Em preparo, Em preparo até Pronto, Pronto até Entregue. Compartilha a mesma extração de dados
// brutos de histórico de status do relatório "Tempo de produção" (`lib/reports/order-timing.ts`).
export function TimeByStatusReport() {
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
        const response = await fetch(`/api/admin/reports/time-by-status?from=${from}&to=${to}`, { cache: "no-store" });
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

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Tempo por status</span><h2>Período</h2></div></div>
      <p className="section-note">Tempo médio agregado que os pedidos passam em cada etapa da cozinha no período (Recebido, Em preparo, Pronto) — média geral por status, não por pedido individual.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <ReportTable
      title="Tempo por status"
      subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
      columns={columns}
      rows={rows}
      exportFileBaseName={`tempo-por-status-${from}-a-${to}`}
      emptyMessage="Nenhuma transição de status registrada no período selecionado."
    />}
  </>;
}
