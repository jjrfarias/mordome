"use client";

import { useEffect, useState } from "react";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { ReportTable } from "@/components/admin/reports/ReportTable";
import type { ReportColumn } from "@/lib/reports/export";
import { money } from "@/lib/domain";

type DiscountType = "PERCENT" | "FIXED";
type Row = { id: string; code: string; discountType: DiscountType; discountValue: number; validFrom: string | null; validUntil: string | null; maxUses: number | null; usesCountTotal: number; usesInPeriod: number; discountAppliedInPeriod: number };
type Summary = { couponsCount: number; usesInPeriod: number; discountAppliedInPeriod: number };

const formatDiscount = (row: Row) => row.discountType === "PERCENT" ? `${row.discountValue.toLocaleString("pt-BR")}%` : money(row.discountValue);
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "Sem validade";

const columns: ReportColumn[] = [
  { key: "code", label: "Código" },
  { key: "discountType", label: "Desconto", format: (_value, row) => formatDiscount(row as Row) },
  { key: "validFrom", label: "Válido de", format: value => formatDate(value as string | null) },
  { key: "validUntil", label: "Válido até", format: value => formatDate(value as string | null) },
  { key: "maxUses", label: "Limite de usos", align: "right", format: value => value === null ? "Ilimitado" : String(value) },
  { key: "usesCountTotal", label: "Usos totais", align: "right" },
  { key: "usesInPeriod", label: "Usos no período", align: "right" },
  { key: "discountAppliedInPeriod", label: "Desconto concedido no período", align: "right", format: value => money(Number(value)) },
];

// Relatório "Cupons gerados" (ADR 0041): lista TODOS os cupons cadastrados até o fim do período
// (não só os usados — "gerados" = criados), com validade, limite e usos totais (histórico,
// `Coupon.usesCount`) além dos usos e do desconto concedido especificamente DENTRO do período
// consultado (via `CouponRedemption`).
export function CouponsGeneratedReport() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ couponsCount: 0, usesInPeriod: 0, discountAppliedInPeriod: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports/coupons-generated?from=${from}&to=${to}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o relatório.");
        if (cancelled) return;
        setRows(data.rows ?? []);
        setSummary(data.summary ?? { couponsCount: 0, usesInPeriod: 0, discountAppliedInPeriod: 0 });
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
    { key: "couponsCount", label: "Cupons cadastrados até o período", value: String(summary.couponsCount) },
    { key: "usesInPeriod", label: "Usos no período", value: String(summary.usesInPeriod) },
    { key: "discountAppliedInPeriod", label: "Desconto total concedido no período", value: money(summary.discountAppliedInPeriod) },
  ];

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Cupons gerados</span><h2>Período</h2></div></div>
      <p className="section-note">Todos os cupons de desconto cadastrados até o fim do período, com validade, limite de usos e quanto de desconto cada um concedeu dentro do período consultado. Cadastre e gerencie cupons em Configurações → Cupons de desconto.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : <ReportTable
      title="Cupons gerados"
      subtitle={`De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`}
      columns={columns}
      rows={rows}
      footer={rows.length > 0 ? footer : undefined}
      exportFileBaseName={`cupons-gerados-${from}-a-${to}`}
      emptyMessage="Nenhum cupom cadastrado até o período selecionado."
    />}
  </>;
}
