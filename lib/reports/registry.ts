import { REPORTS_REVENUE_BY_DAY_VIEW, REPORTS_SALES_BY_PERIOD_VIEW } from "../permissions.ts";

// Catálogo central de relatórios (ADR 0033 — framework de relatórios). Para adicionar um relatório
// novo no futuro: (1) criar sua permissão em `lib/permissions.ts` seguindo `reports.<slug>.view`,
// (2) registrar aqui com `id`/`label`/`description`/`permissionKey`/`category`, (3) implementar a
// rota `GET /api/admin/reports/<id>` e o componente de conteúdo, (4) referenciar o componente no
// mapa `REPORT_COMPONENTS` de `components/admin/ReportsWorkspace.tsx`. Nenhuma outra tela precisa
// mudar — a navegação e a filtragem por permissão já são genéricas.
export type ReportCategory = "Vendas";

export type ReportDefinition = {
  id: string;
  label: string;
  description: string;
  permissionKey: string;
  category: ReportCategory;
};

export const REPORTS_REGISTRY: ReportDefinition[] = [
  {
    id: "sales-by-period",
    label: "Vendas por período",
    description: "Lista as vendas concluídas no período, com canal, mesa, forma de pagamento, valor bruto, desconto e valor líquido.",
    permissionKey: REPORTS_SALES_BY_PERIOD_VIEW,
    category: "Vendas",
  },
  {
    id: "revenue-by-day",
    label: "Faturamento por dia",
    description: "Agrega as vendas do período por dia: quantidade, faturamento bruto, descontos e faturamento líquido.",
    permissionKey: REPORTS_REVENUE_BY_DAY_VIEW,
    category: "Vendas",
  },
];

export function listAvailableReports(permissionKeys: readonly string[]): ReportDefinition[] {
  const granted = new Set(permissionKeys);
  return REPORTS_REGISTRY.filter(report => granted.has(report.permissionKey));
}

export function getReportDefinition(id: string): ReportDefinition | undefined {
  return REPORTS_REGISTRY.find(report => report.id === id);
}
