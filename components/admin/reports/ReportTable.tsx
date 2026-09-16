"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, FileSpreadsheet } from "lucide-react";
import { downloadReportAsExcel, downloadReportAsPdf, type ReportColumn } from "@/lib/reports/export";

export type { ReportColumn };

export type ReportTableProps = {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  footer?: { key: string; label: string; value: string }[];
  exportFileBaseName: string;
  emptyMessage?: string;
};

type SortState = { key: string; direction: "asc" | "desc" } | null;

function compareValues(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR");
}

// Tabela de relatório reutilizável (ADR 0033): ordenação client-side por clique no cabeçalho,
// formatação consistente via `column.format`, e os dois botões de exportação (Excel/PDF) que todo
// relatório do catálogo reaproveita sem implementar a própria exportação.
export function ReportTable({ title, subtitle, columns, rows, footer, exportFileBaseName, emptyMessage = "Nenhum dado no período selecionado." }: ReportTableProps) {
  const [sort, setSort] = useState<SortState>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | "">("");

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const copy = [...rows];
    copy.sort((a, b) => compareValues(a[sort.key], b[sort.key]) * (sort.direction === "asc" ? 1 : -1));
    return copy;
  }, [rows, sort]);

  const toggleSort = (key: string) => {
    setSort(current => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  const runExport = async (kind: "excel" | "pdf") => {
    if (exporting) return;
    setExporting(kind);
    try {
      const input = { title, subtitle, columns, rows: sortedRows };
      if (kind === "excel") await downloadReportAsExcel(input, exportFileBaseName);
      else await downloadReportAsPdf(input, exportFileBaseName);
    } finally {
      setExporting("");
    }
  };

  return <section className="panel settings-shell report-table-panel">
    <div className="settings-shell-header">
      <div><span className="section-kicker">Relatório</span><h2>{title}</h2></div>
      <div className="report-export-actions">
        <button type="button" className="secondary" disabled={!!exporting || rows.length === 0} onClick={() => runExport("excel")}>
          <FileSpreadsheet /> {exporting === "excel" ? "Gerando…" : "Exportar Excel"}
        </button>
        <button type="button" className="secondary" disabled={!!exporting || rows.length === 0} onClick={() => runExport("pdf")}>
          <Download /> {exporting === "pdf" ? "Gerando…" : "Exportar PDF"}
        </button>
      </div>
    </div>
    {subtitle && <p className="section-note">{subtitle}</p>}

    {rows.length === 0 ? <div className="empty small"><span>{emptyMessage}</span></div> : <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            {columns.map(column => <th key={column.key} className={column.align === "right" ? "align-right" : ""}>
              <button type="button" className="report-table-sort" onClick={() => toggleSort(column.key)}>
                {column.label}
                {sort?.key === column.key ? (sort.direction === "asc" ? <ChevronUp /> : <ChevronDown />) : null}
              </button>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => <tr key={index}>
            {columns.map(column => <td key={column.key} className={column.align === "right" ? "align-right" : ""}>
              {column.format ? column.format(row[column.key], row) : String(row[column.key] ?? "")}
            </td>)}
          </tr>)}
        </tbody>
        {footer && footer.length > 0 && <tfoot>
          <tr>
            <td colSpan={columns.length}>
              <div className="report-table-summary">
                {footer.map(item => <span key={item.key}><b>{item.label}:</b> {item.value}</span>)}
              </div>
            </td>
          </tr>
        </tfoot>}
      </table>
    </div>}
  </section>;
}
