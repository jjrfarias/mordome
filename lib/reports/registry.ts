import { REPORTS_COUPONS_GENERATED_VIEW, REPORTS_DRE_VIEW, REPORTS_ITEMS_CONSUMED_VIEW, REPORTS_ITEMS_SOLD_VIEW, REPORTS_PAYMENT_METHODS_VIEW, REPORTS_PERFORMANCE_BY_STAFF_VIEW, REPORTS_PRODUCTION_TIME_VIEW, REPORTS_REVENUE_BY_DAY_VIEW, REPORTS_SALES_BY_DELIVERY_AREA_VIEW, REPORTS_SALES_BY_PERIOD_VIEW, REPORTS_TIME_BY_STATUS_VIEW } from "../permissions.ts";

// Catálogo central de relatórios (ADR 0033 — framework de relatórios). Para adicionar um relatório
// novo no futuro: (1) criar sua permissão em `lib/permissions.ts` seguindo `reports.<slug>.view`,
// (2) registrar aqui com `id`/`label`/`description`/`permissionKey`/`category`, (3) implementar a
// rota `GET /api/admin/reports/<id>` e o componente de conteúdo, (4) referenciar o componente no
// mapa `REPORT_COMPONENTS` de `components/admin/ReportsWorkspace.tsx`. Nenhuma outra tela precisa
// mudar — a navegação e a filtragem por permissão já são genéricas.
export type ReportCategory = "Vendas" | "Financeiro";

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
  {
    id: "items-sold",
    label: "Itens vendidos",
    description: "Ranking de produtos mais vendidos no período por faturamento, com quantidade total vendida, receita total e preço médio praticado.",
    permissionKey: REPORTS_ITEMS_SOLD_VIEW,
    category: "Vendas",
  },
  {
    id: "items-consumed",
    label: "Itens consumidos",
    description: "Agrupa o consumo de estoque (baixa automática por venda via ficha técnica) por insumo no período, com quantidade total consumida e número de movimentações.",
    permissionKey: REPORTS_ITEMS_CONSUMED_VIEW,
    category: "Vendas",
  },
  {
    id: "production-time",
    label: "Tempo de produção",
    description: "Tempo entre o envio do pedido à cozinha e ele ficar pronto, por pedido, com tempo médio de produção do período.",
    permissionKey: REPORTS_PRODUCTION_TIME_VIEW,
    category: "Vendas",
  },
  {
    id: "time-by-status",
    label: "Tempo por status",
    description: "Tempo médio agregado que os pedidos passam em cada etapa da cozinha (Recebido, Em preparo, Pronto) no período.",
    permissionKey: REPORTS_TIME_BY_STATUS_VIEW,
    category: "Vendas",
  },
  {
    id: "dre",
    label: "DRE Gerencial",
    description: "Demonstração de Resultado do Exercício simplificada e gerencial do período: receita líquida, CMV, lucro bruto, despesas operacionais, outras receitas e resultado. Não substitui uma DRE contábil/fiscal (sem impostos nem depreciação).",
    permissionKey: REPORTS_DRE_VIEW,
    category: "Financeiro",
  },
  {
    id: "coupons-generated",
    label: "Cupons gerados",
    description: "Lista todos os cupons de desconto cadastrados até o período, com validade, limite de usos, usos totais, usos no período e valor total de desconto concedido através de cada um.",
    permissionKey: REPORTS_COUPONS_GENERATED_VIEW,
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
