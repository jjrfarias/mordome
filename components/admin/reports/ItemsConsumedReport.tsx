"use client";

import { useEffect, useState } from "react";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";

type BaseUnit = "GRAM" | "MILLILITER" | "UNIT";
const unitLabels: Record<BaseUnit, string> = { GRAM: "g", MILLILITER: "ml", UNIT: "un" };

type Row = { rank: number; inventoryItemId: string; inventoryItemName: string; baseUnit: BaseUnit; quantity: number; movementsCount: number };
type Summary = { itemsCount: number; movementsCount: number };

const columns: ReportColumn[] = [
  { key: "rank", label: "Posição", align: "right" },
  { key: "inventoryItemName", label: "Insumo" },
  { key: "baseUnit", label: "Unidade", format: value => unitLabels[value as BaseUnit] ?? String(value) },
  { key: "quantity", label: "Quantidade consumida", align: "right", format: value => Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) },
  { key: "movementsCount", label: "Nº de movimentações", align: "right" },
];

// Relatório "Itens consumidos" (ADR 0038): quanto de cada insumo de estoque foi realmente consumido
// no período, agregando os movimentos `CONSUMPTION` (baixa automática por venda, via ficha técnica)
// por insumo — quantidade total consumida (valor absoluto, já que `CONSUMPTION` é negativo) e número
// de movimentações. Diferente do Relatório de CMV (que é sobre CUSTO em dinheiro) e de "Itens
// vendidos" (que é sobre PRODUTOS finais vendidos): este é sobre QUANTIDADE DE INSUMO consumida.
// Ordenado por quantidade consumida decrescente.
export function ItemsConsumedReport() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ itemsCount: 0, movementsCount: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports/items-consumed?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o relatório.");
        if (cancelled) return;
        setRows(data.rows ?? []);
        setSummary(data.summary ?? { itemsCount: 0, movementsCount: 0 });
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
    { key: "itemsCount", label: "Insumos consumidos no período", value: String(summary.itemsCount) },
    { key: "movementsCount", label: "Nº total de movimentações", value: String(summary.movementsCount) },
  ];

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Itens consumidos</span><h2>Período</h2></div></div>
      <p className="section-note">Quanto de cada insumo de estoque foi consumido no período (baixa automática por venda, via ficha técnica) — quantidade e número de movimentações. Não considera perdas nem ajustes, só consumo real por venda.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <ReportTable
      title="Itens consumidos"
      subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
      columns={columns}
      rows={rows}
      footer={rows.length > 0 ? footer : undefined}
      exportFileBaseName={`itens-consumidos-${from}-a-${to}`}
      emptyMessage="Nenhum consumo de estoque registrado no período selecionado."
    />}
  </>;
}
