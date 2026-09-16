import { DASHBOARDS_MULTI_STORE_TRACKING_VIEW, DASHBOARDS_SALES_TRACKING_VIEW } from "../permissions.ts";

// Catálogo central de dashboards (ADR 0042 — dashboards de vendas), espelhando o catálogo de
// relatórios (`lib/reports/registry.ts`), mas para o módulo Dashboards (telas visuais/gráficas, sem
// tabela genérica nem exportação).
export type DashboardDefinition = {
  id: string;
  label: string;
  description: string;
  permissionKey: string;
};

export const DASHBOARDS_REGISTRY: DashboardDefinition[] = [
  {
    id: "sales-tracking",
    label: "Acompanhamento de vendas",
    description: "Faturamento, vendas e ticket médio de hoje na unidade ativa, com o horário de pico e a composição por canal.",
    permissionKey: DASHBOARDS_SALES_TRACKING_VIEW,
  },
  {
    id: "multi-store-tracking",
    label: "Acompanhamento de vendas multilojas",
    description: "Faturamento consolidado do dia entre todas as unidades acessíveis, com o ranking de lojas por faturamento.",
    permissionKey: DASHBOARDS_MULTI_STORE_TRACKING_VIEW,
  },
];

export function listAvailableDashboards(permissionKeys: readonly string[]): DashboardDefinition[] {
  const granted = new Set(permissionKeys);
  return DASHBOARDS_REGISTRY.filter(dashboard => granted.has(dashboard.permissionKey));
}
