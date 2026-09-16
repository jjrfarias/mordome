# ADR 0035: Relatório "Vendas por forma de pagamento"

- Estado: aceito
- Data: 2026-09-16

## Contexto

O ADR 0033 entregou o framework de relatórios e deixou "vendas por forma de pagamento" fora de
escopo, junto com outros relatórios do menu original. Esta fatia entrega esse relatório,
reaproveitando integralmente a base do framework (permissão granular, catálogo central,
`ReportTable`, exportação, `PeriodFilter`): para um período, agrupa os pagamentos das vendas
concluídas por forma de pagamento (`PaymentMethod`: PIX, CREDIT_CARD, DEBIT_CARD, CASH, OTHER),
mostrando quantidade de pagamentos e valor total recebido em cada forma, com resumo de total geral
e participação percentual de cada forma.

## Decisões

1. **Agregação por PAGAMENTO individual (`Payment.method`/`Payment.amount`), não por venda
   inteira.** Uma venda pode ter mais de um pagamento (split, ex. metade Pix + metade dinheiro).
   Diferente de Vendas por período/Faturamento por dia/Desempenho por pessoa (que somam
   `Sale.total`/`subtotal` uma vez por venda), este relatório itera sobre os pagamentos de cada
   venda e soma `Payment.amount` na forma correspondente — uma venda com split aparece em mais de
   uma linha do relatório, cada uma com o valor do pagamento daquela forma específica.

2. **Mesmo filtro de "vendas concluídas no período" do resto do framework** (status `COMPLETED`/
   `PARTIALLY_REFUNDED`, excluindo canceladas e totalmente reembolsadas, `refunded >= total`) — sem
   restrição de canal: ao contrário de Desempenho por atendente/garçom (ADR 0034), que exclui
   `DELIVERY` por não ter papel de atendente/garçom associado, aqui todo canal (PDV, Salão,
   Delivery) participa igualmente, porque forma de pagamento não depende de canal.

3. **Sem rateio de reembolso por forma de pagamento.** `Payment.amount` é o valor efetivamente
   recebido naquela forma no fechamento da venda; um reembolso parcial não é descontado de nenhuma
   forma de pagamento específica neste relatório (o `Refund` não referencia qual `Payment` foi
   estornado no modelo atual). Decidido nesta fatia, sujeito a revisão: se o produto precisar saber
   "quanto de Pix foi efetivamente líquido após reembolsos", isso exige um vínculo
   `Refund → Payment` que não existe hoje.

4. **`SaleRecord.payments` (lista de `{ method, amount }`) estendido em `lib/reports/sales.ts`**,
   opcional e ignorado pelos demais relatórios, seguindo o mesmo padrão já usado por
   `operatorId`/`operatorName` (ADR 0034). No modo servidor vem de `Payment` via Prisma; no modo
   local, do próprio array `payments` já gravado no evento de auditoria `SALE_COMPLETE`
   (`app/api/operations/sales/route.ts` grava `payments: resolvePayments(...)`, que já inclui
   `method`+`amount`) — nenhuma estrutura nova, mesma fonte usada pelos demais relatórios locais
   (`listLocalSalesForReport` em `lib/local-finance.ts`).

5. **Cálculo puro isolado em `lib/reports/payment-methods.ts`**, mesmo padrão de
   `lib/reports/staff-performance.ts`: formato de linha (por forma de pagamento, não por
   venda/dia/pessoa) diferente o bastante para justificar arquivo próprio. Linhas ordenadas por
   valor total recebido decrescente; cada linha já carrega `share` (participação 0–1 sobre o total
   geral), calculado uma vez sobre o conjunto completo antes da ordenação.

6. **Sem persistência nova**, mesmo padrão de todo o framework — somente leitura calculada sob
   demanda a partir de `Sale`/`Payment`/`Refund` (modo servidor) ou do log de auditoria local (modo
   local).

7. **Nova permissão granular `reports.payment_methods.view`**, mesmo padrão `reports.<slug>.view`
   do ADR 0033, registrada em `lib/permissions.ts`, incluída em `OWNER_PERMISSIONS`, propagada ao
   array padrão de `permissionKeys` do modo local (`lib/local-auth.ts`) e concedida a todo
   `CustomRole` com `systemTemplate = true` pela migração
   `20260928090000_relatorio_vendas_por_forma_de_pagamento`, mesmo padrão das migrações anteriores.

8. **UI: uma única tabela (`ReportTable`)** com colunas Forma de pagamento, Qtde. de pagamentos,
   Valor total recebido e % de participação, e rodapé com total de pagamentos e total geral
   recebido — ao contrário de Desempenho por atendente/garçom (duas seções fixas), este relatório
   não tem uma dimensão natural de "papel" para separar em seções.

## Consequências

- Forma de pagamento sem nenhum pagamento no período simplesmente não aparece na tabela (mesmo
  comportamento de "pessoa sem vendas" do ADR 0034).
- Se o modelo de dados ganhar `Refund → Payment` no futuro, o rateio de reembolso por forma de
  pagamento pode ser revisto — não é uma limitação bloqueante hoje porque o valor de "quanto foi
  recebido" (bruto, no fechamento) já é uma métrica útil por si.
- Nenhuma dependência nova, nenhum relatório existente muda de comportamento — apenas
  `SaleRecord` ganhou um campo opcional adicional.
