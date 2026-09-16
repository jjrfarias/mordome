// Cálculo puro da DRE Gerencial/Financeira simplificada (ADR 0040). Diferente de todos os
// relatórios anteriores da série (ADR 0033 em diante), este CRUZA três fontes já cobertas por
// outros módulos — vendas, CMV (`lib/cmv.ts`, ADR 0026) e lançamentos financeiros pagos por
// categoria (mesma lógica já usada pelo Fluxo de caixa, `lib/cashflow.ts`/`lib/local-finance.ts`,
// ADR 0016) — mas não recalcula nenhuma delas: recebe os totais já agregados e só monta a
// demonstração linha a linha.
//
// É uma DRE GERENCIAL, não uma peça contábil/fiscal: não há cálculo de impostos (ICMS, PIS/COFINS,
// IRPJ/CSLL) nem depreciação. Isso é uma simplificação deliberada desta fatia — ver ADR 0040.
//
// Fórmula exata (ver ADR 0040):
//   (+) Receita bruta de vendas          = soma de Sale.total (COMPLETED/PARTIALLY_REFUNDED) no período
//   (-) Descontos concedidos             = soma de Sale.discount
//   (-) Reembolsos                       = soma de Refund.amount de vendas do período
//   (=) Receita líquida de vendas
//   (-) CMV (custo de mercadoria vendida) = lib/cmv.ts (buildCmvReport) para o mesmo período
//   (=) Lucro bruto
//   (-) Despesas operacionais            = soma de FinancialEntry pagos (status=PAID, paidAt no
//                                           período) cuja categoria é EXPENSE
//   (+) Outras receitas                  = soma de FinancialEntry pagos cuja categoria é INCOME
//   (=) Resultado do período (lucro ou prejuízo)

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type DreInput = {
  grossRevenue: number; // soma de Sale.total no período
  discounts: number; // soma de Sale.discount no período
  refunds: number; // soma de Refund.amount das vendas do período
  cmv: number; // buildCmvReport(...).cmvTotal do mesmo período
  operatingExpenses: number; // soma de FinancialEntry pagos, categoria EXPENSE
  otherIncome: number; // soma de FinancialEntry pagos, categoria INCOME
};

export type DreLineKind = "line" | "subtotal" | "result";

export type DreLine = {
  key: string;
  label: string;
  // Já com o sinal correto para exibição/exportação (negativo para linhas de dedução).
  value: number;
  kind: DreLineKind;
};

export type DreReport = {
  grossRevenue: number;
  discounts: number;
  refunds: number;
  netRevenue: number;
  cmv: number;
  grossProfit: number;
  operatingExpenses: number;
  otherIncome: number;
  result: number;
  lines: DreLine[];
};

/**
 * Monta a demonstração linha a linha a partir dos totais já agregados. Não busca dados nem
 * recalcula CMV/lançamentos — isso é responsabilidade da rota (modo Prisma ou modo local), que
 * reaproveita `buildCmvReport` (`lib/cmv.ts`) e a mesma agregação de `FinancialEntry` pagos por
 * categoria já usada pelo Fluxo de caixa. Período sem nenhum dado (todas as entradas em 0) produz
 * uma DRE inteiramente zerada, sem erro.
 */
export function buildDreReport(input: DreInput): DreReport {
  const grossRevenue = round(input.grossRevenue);
  const discounts = round(input.discounts);
  const refunds = round(input.refunds);
  const netRevenue = round(grossRevenue - discounts - refunds);
  const cmv = round(input.cmv);
  const grossProfit = round(netRevenue - cmv);
  const operatingExpenses = round(input.operatingExpenses);
  const otherIncome = round(input.otherIncome);
  const result = round(grossProfit - operatingExpenses + otherIncome);

  const lines: DreLine[] = [
    { key: "grossRevenue", label: "Receita bruta de vendas", value: grossRevenue, kind: "line" },
    { key: "discounts", label: "Descontos concedidos", value: round(-discounts), kind: "line" },
    { key: "refunds", label: "Reembolsos", value: round(-refunds), kind: "line" },
    { key: "netRevenue", label: "Receita líquida de vendas", value: netRevenue, kind: "subtotal" },
    { key: "cmv", label: "CMV (custo de mercadoria vendida)", value: round(-cmv), kind: "line" },
    { key: "grossProfit", label: "Lucro bruto", value: grossProfit, kind: "subtotal" },
    { key: "operatingExpenses", label: "Despesas operacionais", value: round(-operatingExpenses), kind: "line" },
    { key: "otherIncome", label: "Outras receitas", value: otherIncome, kind: "line" },
    { key: "result", label: "Resultado do período", value: result, kind: "result" },
  ];

  return { grossRevenue, discounts, refunds, netRevenue, cmv, grossProfit, operatingExpenses, otherIncome, result, lines };
}
