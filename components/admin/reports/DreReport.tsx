"use client";

import { useEffect, useState } from "react";
import { PeriodFilter, startOfMonth, toDateInput } from "@/components/admin/PeriodFilter";
import { money } from "@/lib/domain";
import { downloadReportAsExcel, downloadReportAsPdf, type ReportColumn } from "@/lib/reports/export";

type DreLineKind = "line" | "subtotal" | "result";
type DreLine = { key: string; label: string; value: number; kind: DreLineKind };
type DreData = {
  grossRevenue: number; discounts: number; refunds: number; netRevenue: number;
  cmv: number; grossProfit: number; operatingExpenses: number; otherIncome: number; result: number;
  lines: DreLine[];
};

const exportColumns: ReportColumn[] = [
  { key: "label", label: "Linha" },
  { key: "value", label: "Valor", align: "right", format: value => money(Number(value)) },
];

// Relatório "DRE Gerencial" (ADR 0040): demonstração de resultado simplificada e gerencial (não
// contábil/fiscal — sem impostos nem depreciação), cruzando vendas do período, CMV (Relatório de
// CMV já existente, ADR 0026) e lançamentos financeiros pagos por categoria (mesma lógica do Fluxo
// de caixa, ADR 0016). Exibida como lista de linhas (não `ReportTable`), com subtotais e o
// resultado final destacados visualmente — layout de "cards de resumo"/linha de total, mesmo
// padrão já usado por `.ticket-footer`/`.stock-count-summary`. Exportação Excel/PDF reaproveita
// `lib/reports/export.ts`, tratando cada linha da DRE como uma linha de tabela simples.
export function DreReport() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DreData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports/dre?from=${from}&to=${to}`, { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error ?? "Não foi possível carregar o relatório.");
        if (cancelled) return;
        setData(json as DreData);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o relatório.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    queueMicrotask(() => { void load(); });
    return () => { cancelled = true; };
  }, [from, to]);

  const subtitle = `De ${new Date(from).toLocaleDateString("pt-BR")} até ${new Date(to).toLocaleDateString("pt-BR")}`;
  const exportRows = (data?.lines ?? []).map(line => ({ label: line.label, value: line.value }));
  const exportInput = { title: "DRE Gerencial", subtitle, columns: exportColumns, rows: exportRows };
  const baseName = `dre-gerencial-${from}-a-${to}`;

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">DRE Gerencial</span><h2>Período</h2></div></div>
      <p className="section-note">
        Demonstração de Resultado do Exercício simplificada e gerencial: receita líquida de vendas, CMV, lucro
        bruto, despesas operacionais, outras receitas e o resultado do período. Não é uma DRE contábil/fiscal
        — não calcula impostos nem depreciação.
      </p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}

    {loading ? <div className="empty"><span>Carregando relatório…</span></div> : data && <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><h2>DRE Gerencial</h2><p className="section-note">{subtitle}</p></div>
        <div className="header-actions">
          <button className="secondary" onClick={() => { void downloadReportAsExcel(exportInput, baseName); }}>Exportar Excel</button>
          <button className="secondary" onClick={() => { void downloadReportAsPdf(exportInput, baseName); }}>Exportar PDF</button>
        </div>
      </div>
      <div className="dre-lines">
        {data.lines.map(line => <div key={line.key} className={`dre-line dre-line-${line.kind}`}>
          <span>{line.label}</span>
          <strong className={line.value < 0 ? "negative" : ""}>{money(line.value)}</strong>
        </div>)}
      </div>
    </section>}
  </>;
}
