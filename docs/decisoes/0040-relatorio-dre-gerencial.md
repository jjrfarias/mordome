# ADR 0040: Relatório "DRE Gerencial"

- Estado: aceito
- Data: 2026-09-16

## Contexto

O ADR 0033 deixou a DRE explicitamente fora de escopo do framework inicial de relatórios. É o
relatório mais complexo da série porque CRUZA três fontes que já existem, cada uma com sua própria
fatia/ADR:

- Vendas concluídas do período (`Sale`/`Refund`), a mesma fonte usada pelos relatórios de Vendas
  por período/Faturamento por dia (ADR 0033).
- CMV (custo de mercadoria vendida) do período, já calculado pelo Relatório de CMV (ADR 0026,
  `lib/cmv.ts`, `buildCmvReport`).
- Lançamentos financeiros pagos por categoria (INCOME/EXPENSE), a mesma agregação já usada pelo
  Fluxo de caixa (ADR 0016, `lib/cashflow.ts`/`lib/local-finance.ts`).

Esta fatia entrega uma DRE (Demonstração de Resultado do Exercício) **GERENCIAL**, não uma peça
**contábil/fiscal**: não calcula impostos (ICMS, PIS/COFINS, IRPJ/CSLL) nem depreciação. É uma
visão de margem para o dono decidir o negócio, explicitamente simplificada — decisão deliberada
desta fatia, documentada aqui e no texto de apoio da própria tela.

## Fórmula exata implementada

```
(+) Receita bruta de vendas          = soma de (Sale.total + Sale.discount), vendas
                                        COMPLETED/PARTIALLY_REFUNDED no período
(-) Descontos concedidos             = soma de Sale.discount
(-) Reembolsos                       = soma de Refund.amount de vendas do período
(=) Receita líquida de vendas
(-) CMV (custo de mercadoria vendida) = buildCmvReport (lib/cmv.ts) para o mesmo período
(=) Lucro bruto
(-) Despesas operacionais            = soma de FinancialEntry pagos (status=PAID, paidAt no
                                        período) cuja categoria é EXPENSE
(+) Outras receitas                  = soma de FinancialEntry pagos cuja categoria é INCOME
(=) Resultado do período (lucro ou prejuízo)
```

## Decisões

1. **Reaproveita `lib/cmv.ts` (`buildCmvReport`/`weightedAverageCost`) em vez de recalcular CMV do
   zero.** A rota (`app/api/admin/reports/dre/route.ts`) monta os mesmos `CmvSaleItemInput` que a
   rota de CMV já monta (custo médio ponderado por insumo a partir de `StockMovement`/entradas com
   custo, `recipeSnapshot` por `SaleItem` no servidor), e usa só `cmvReport.cmvTotal` — nenhuma
   lógica de custo é duplicada. Herda as mesmas limitações já documentadas no ADR 0026 (custo médio
   "atual", não histórico por data; produto sem ficha técnica não entra no CMV).

2. **Reaproveita a mesma agregação de `FinancialEntry` pagos por categoria do Fluxo de caixa**, sem
   nova função de somatório: a rota consulta `FinancialEntry` com `status = PAID` e `paidAt` no
   período, e separa por `category.kind` (`INCOME` → Outras receitas, `EXPENSE` → Despesas
   operacionais) — o mesmo critério de `entry.category.kind === "INCOME" ? "IN" : "OUT"` já usado em
   `app/api/admin/finance/cashflow/route.ts`/`computeLocalCashFlow`.

3. **Receita bruta/Descontos/Reembolsos vêm direto de `Sale`/`Refund`**, sem passar por
   `lib/reports/sales.ts` (que já resume em `subtotal`/`total`/`refunded`, mas com foco em
   "linha por venda" para tabela, não em somatório agregado): a rota soma `sale.total + sale.discount`
   (ver correção abaixo), `sale.discount` e `sale.refunds[].amount` diretamente na mesma consulta
   que já busca as vendas para o CMV — evita uma segunda consulta ao banco. Em modo local,
   `computeLocalDre` (`lib/local-finance.ts`) reaproveita `listLocalSalesForReport` (já usado por
   outros relatórios), somando `total + discount`/`discount`/`refunded` de cada `SaleRecord` — sem
   duplicar a filtragem de vendas concluídas/canceladas/reembolsadas totalmente, que já vive lá.

   **Correção pós-implementação (mesmo dia):** a primeira versão usava `Sale.total` puro como
   receita bruta. Como `Sale.total` já é líquido de desconto (`total = grossTotal - discount`, ver
   `app/api/operations/sales/route.ts`), isso descontava o desconto DUAS VEZES na Receita líquida —
   bug pego na rotina de re-teste antes de commitar. A receita bruta correta reconstitui o valor
   pré-desconto somando `Sale.total + Sale.discount`. Corrigido em `app/api/admin/reports/dre/route.ts`,
   `lib/local-finance.ts` (`computeLocalDre`) e no teste de integração de `tests/dre.test.ts` (que
   tinha os valores esperados calculados com o bug).

4. **Cálculo puro isolado em `lib/reports/dre.ts`** (`buildDreReport`), mesmo padrão de todo o
   framework: recebe os seis totais já agregados (`grossRevenue`, `discounts`, `refunds`, `cmv`,
   `operatingExpenses`, `otherIncome`) e só monta a demonstração linha a linha com os subtotais
   corretos — sem Prisma/Next, testável isoladamente com `node --test`. Período sem nenhum dado
   (todos os totais em 0) produz uma DRE inteiramente zerada, sem erro.

5. **Modo local: `computeLocalDre` em `lib/local-finance.ts`**, não em `lib/reports/dre.ts` (que
   fica puro) nem em `lib/cmv.ts`. Reconstitui o CMV da mesma forma que a rota de CMV em modo local
   (ADR 0026, decisão 6): ficha técnica ATUAL do produto aplicada aos itens de cada evento
   `SALE_COMPLETE` do período (não há `recipeSnapshot` por venda em modo local). Não recebe nem
   retorna nenhuma fatia `data` mutável dos módulos locais — só lê (`listLocalSalesForReport`,
   `listLocalRecipes`, `listLocalAudit`, `listLocalFinancialCategories`,
   `listLocalFinancialEntries`, `getLocalAverageCostByInventoryItemId`) e devolve um `DreReport`
   novo.

6. **Nova permissão granular `reports.dre.view`**, mesmo padrão `reports.<slug>.view` do ADR 0033,
   registrada em `lib/permissions.ts`, incluída em `OWNER_PERMISSIONS`, propagada ao array padrão de
   `permissionKeys` do modo local (`lib/local-auth.ts`) e concedida a todo `CustomRole` com
   `systemTemplate = true` pela migração `20261003090000_relatorio_dre_gerencial`, mesmo padrão das
   migrações anteriores da série.

7. **UI: lista de linhas com subtotais/resultado destacados, não `ReportTable`.** Diferente de todo
   relatório anterior da série, a DRE é conceitualmente uma demonstração contábil (linhas de
   dedução, subtotais intermediários, resultado final), não uma tabela ordenável de registros —
   ordenar "linhas de uma DRE" não faz sentido. `components/admin/reports/DreReport.tsx` renderiza
   `data.lines` como uma lista (`.dre-lines`/`.dre-line`, novo CSS reaproveitando os tokens de design
   já usados por `.ticket-footer`/`.stock-count-summary`: `--line`, `--mint`, `--green`,
   `font-fraunces`), com `.dre-line-subtotal` (Receita líquida, Lucro bruto) e `.dre-line-result`
   (Resultado do período) visualmente destacados. Os dois botões de exportação (Excel/PDF) ficam no
   cabeçalho da seção, chamando `downloadReportAsExcel`/`downloadReportAsPdf`
   (`lib/reports/export.ts`) diretamente com cada linha da DRE tratada como uma linha de tabela
   simples (`{ label, value }`), sem precisar do componente `ReportTable`.

8. **Categoria "Financeiro" nova no catálogo (`lib/reports/registry.ts`)**, diferente de "Vendas"
   usada por todos os relatórios anteriores — a DRE é fundamentalmente uma visão financeira
   consolidada, não uma visão só de vendas, apesar de cruzar dados de vendas.

## Consequências

- Nenhuma tabela nova, nenhuma duplicação de lógica de CMV ou de soma de lançamentos por categoria
  — a DRE é 100% derivada de `Sale`/`Refund`/`StockMovement`/`Recipe`/`FinancialEntry` já existentes,
  através das mesmas funções puras já usadas pelo Relatório de CMV e pelo Fluxo de caixa.
- Herda todas as limitações já documentadas do Relatório de CMV (custo médio "atual", não histórico
  por data; produto sem ficha técnica fica de fora do CMV, o que também reduz o CMV total desta DRE
  proporcionalmente).
- É explicitamente uma DRE GERENCIAL: sem impostos, sem depreciação, sem rateio de custos fixos
  além do que já está lançado como despesa operacional paga. Uma DRE contábil/fiscal formal (se
  algum dia necessária, por exemplo para apresentar ao contador) é uma fatia futura fora de escopo
  aqui — exigiria regime de competência, não de caixa, e cálculo de tributos, hoje inexistente no
  sistema.
- "Cupons gerados" (outro relatório citado no menu original do ADR 0033) permanece fora de escopo,
  não implementado nesta fatia.
