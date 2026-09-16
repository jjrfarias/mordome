// Exportação genérica de relatórios (ADR 0033). Compartilhada por qualquer relatório do catálogo
// (`lib/reports/registry.ts`) — nenhum relatório implementa sua própria exportação.
//
// Bibliotecas escolhidas (sem serviço externo, tudo roda no navegador):
// - Excel: `exceljs` — gera `.xlsx` real (não CSV disfarçado), com formatação de colunas, mantida
//   e amplamente usada, funciona tanto em Node quanto no browser via `workbook.xlsx.writeBuffer()`.
// - PDF: `jspdf` + `jspdf-autotable` — geração de PDF e tabelas no cliente, sem serviço externo,
//   biblioteca madura e extremamente usada para esse caso.
//
// As funções de "build" (`buildExcelBuffer`/`buildPdfBuffer`) são puras o bastante para rodar em
// testes com `node --test` (sem exigir DOM) — apenas os `download*` finais tocam `window`/`document`.

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: (value: unknown, row: Record<string, unknown>) => string;
};

export type ReportExportInput = {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  subtitle?: string;
};

function cellText(column: ReportColumn, row: Record<string, unknown>) {
  const raw = row[column.key];
  if (column.format) return column.format(raw, row);
  if (raw === null || raw === undefined) return "";
  return String(raw);
}

export async function buildExcelBuffer(input: ReportExportInput): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mordomê";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(input.title.slice(0, 31) || "Relatório");

  sheet.addRow([input.title]);
  sheet.mergeCells(1, 1, 1, Math.max(input.columns.length, 1));
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  if (input.subtitle) {
    sheet.addRow([input.subtitle]);
    sheet.mergeCells(2, 1, 2, Math.max(input.columns.length, 1));
    sheet.getCell(2, 1).font = { italic: true, color: { argb: "FF6F756F" } };
  }
  sheet.addRow([]);

  const headerRow = sheet.addRow(input.columns.map(column => column.label));
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE8DF" } };
  });

  for (const row of input.rows) {
    sheet.addRow(input.columns.map(column => cellText(column, row)));
  }

  sheet.columns.forEach((column, index) => {
    const header = input.columns[index]?.label ?? "";
    const maxContent = input.rows.reduce((max, row) => Math.max(max, cellText(input.columns[index], row).length), header.length);
    column.width = Math.min(Math.max(maxContent + 2, 12), 40);
    if (input.columns[index]?.align === "right") column.alignment = { horizontal: "right" };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer as ArrayBufferLike as ArrayBuffer).buffer;
}

export async function buildPdfBuffer(input: ReportExportInput): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: input.columns.length > 5 ? "landscape" : "portrait", unit: "pt" });

  doc.setFontSize(14);
  doc.text(input.title, 40, 40);
  let startY = 58;
  if (input.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(110, 117, 111);
    doc.text(input.subtitle, 40, startY);
    doc.setTextColor(0, 0, 0);
    startY += 16;
  }

  autoTable(doc, {
    startY,
    head: [input.columns.map(column => column.label)],
    body: input.rows.map(row => input.columns.map(column => cellText(column, row))),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [22, 60, 50], textColor: 255 },
    margin: { left: 40, right: 40 },
  });

  const output = doc.output("arraybuffer");
  return output as ArrayBuffer;
}

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MIME = "application/pdf";

function triggerDownload(buffer: ArrayBuffer, filename: string, mime: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadReportAsExcel(input: ReportExportInput, filename: string) {
  const buffer = await buildExcelBuffer(input);
  triggerDownload(buffer, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`, EXCEL_MIME);
}

export async function downloadReportAsPdf(input: ReportExportInput, filename: string) {
  const buffer = await buildPdfBuffer(input);
  triggerDownload(buffer, filename.endsWith(".pdf") ? filename : `${filename}.pdf`, PDF_MIME);
}
