"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/domain";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";

type Row = { deliveryAreaId: string | null; areaName: string; ordersCount: number; productsTotal: number; deliveryFeeTotal: number; grandTotal: number };
type Summary = { ordersCount: number; productsTotal: number; deliveryFeeTotal: number; grandTotal: number };

const columns: ReportColumn[] = [
  { key: "areaName", label: "Área de entrega" },
  { key: "ordersCount", label: "Qtde. de pedidos", align: "right" },
  { key: "productsTotal", label: "Valor de produtos", align: "right", format: value => money(Number(value)) },
  { key: "deliveryFeeTotal", label: "Total de taxas de entrega", align: "right", format: value => money(Number(value)) },
  { key: "grandTotal", label: "Valor total geral", align: "right", format: value => money(Number(value)) },
];

// Relatório "Vendas por área de entrega" (ADR 0036): agrupa vendas de delivery concluídas no
// período por área de entrega (`DeliveryArea`, ADR 0028), com quantidade de pedidos, valor de
// produtos (subtotal, sem taxa), total de taxas de entrega cobradas e valor total geral. Pedidos
// sem área vinculada aparecem numa linha própria "Sem área definida". Ordenado por valor total
// geral decrescente.
export function SalesByDeliveryAreaReport() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ ordersCount: 0, productsTotal: 0, deliveryFeeTotal: 0, grandTotal: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports/sales-by-delivery-area?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o relatório.");
        if (cancelled) return;
        setRows(data.rows ?? []);
        setSummary(data.summary ?? { ordersCount: 0, productsTotal: 0, deliveryFeeTotal: 0, grandTotal: 0 });
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
    { key: "ordersCount", label: "Total de pedidos", value: String(summary.ordersCount) },
    { key: "productsTotal", label: "Total de produtos", value: money(summary.productsTotal) },
    { key: "deliveryFeeTotal", label: "Total de taxas de entrega", value: money(summary.deliveryFeeTotal) },
    { key: "grandTotal", label: "Total geral", value: money(summary.grandTotal) },
  ];

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Vendas por área de entrega</span><h2>Período</h2></div></div>
      <p className="section-note">Agrupa os pedidos de delivery concluídos no período por área de entrega, com valor de produtos, taxas de entrega cobradas e valor total geral. Pedidos sem área vinculada aparecem em &quot;Sem área definida&quot;.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <ReportTable
      title="Vendas por área de entrega"
      subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
      columns={columns}
      rows={rows}
      footer={rows.length > 0 ? footer : undefined}
      exportFileBaseName={`vendas-por-area-de-entrega-${from}-a-${to}`}
      emptyMessage="Nenhum pedido de delivery concluído no período selecionado."
    />}
  </>;
}
