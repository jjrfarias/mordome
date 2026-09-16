import { REPORTS_PAYMENT_METHODS_VIEW, REPORTS_PERFORMANCE_BY_STAFF_VIEW, REPORTS_REVENUE_BY_DAY_VIEW, REPORTS_SALES_BY_DELIVERY_AREA_VIEW, REPORTS_SALES_BY_PERIOD_VIEW } from "../permissions.ts";

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
  {
    id: "performance-by-staff",
    label: "Desempenho por atendente/garçom",
    description: "Ranking de vendas por pessoa no período, separado por Atendentes (PDV) e Garçons (Salão). Não calcula comissão — ver Acertos para isso.",
    permissionKey: REPORTS_PERFORMANCE_BY_STAFF_VIEW,
    category: "Vendas",
  },
  {
    id: "payment-methods",
    label: "Vendas por forma de pagamento",
    description: "Agrupa os pagamentos das vendas concluídas no período por forma (Pix, cartão, dinheiro), com quantidade, valor total recebido e participação percentual.",
    permissionKey: REPORTS_PAYMENT_METHODS_VIEW,
    category: "Vendas",
  },
  {
    id: "sales-by-delivery-area",
    label: "Vendas por área de entrega",
    description: "Agrupa os pedidos de delivery concluídos no período por área de entrega, com quantidade de pedidos, valor de produtos, taxas de entrega cobradas e valor total geral.",
    permissionKey: REPORTS_SALES_BY_DELIVERY_AREA_VIEW,
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
