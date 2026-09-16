# ADR 0036: Relatório "Vendas por área de entrega"

- Estado: aceito
- Data: 2026-09-16

## Contexto

O ADR 0033 entregou o framework de relatórios e deixou "vendas por área de entrega" fora de escopo,
junto com outros relatórios do menu original. Esta fatia entrega esse relatório, reaproveitando
integralmente a base do framework (permissão granular, catálogo central, `ReportTable`, exportação,
`PeriodFilter`): para um período, agrupa os pedidos de delivery concluídos (`Sale.channel =
DELIVERY`, vinculados a `DeliveryOrder.deliveryAreaId`) por área de entrega (`DeliveryArea`, ver ADR
0028), mostrando nome da área, quantidade de pedidos, valor total de produtos (subtotal, sem taxa),
total de taxas de entrega cobradas e valor total geral.

## Decisões

1. **Agregação por VENDA (uma linha por pedido de delivery concluído), agrupada por área**, ao
   contrário de Vendas por forma de pagamento (ADR 0035, que agrega por pagamento individual). Cada
   venda de delivery contribui exatamente uma vez, na linha da área vinculada ao seu
   `DeliveryOrder.deliveryAreaId` no momento em que o pedido foi criado (snapshot, ADR 0028) — não
   há split de uma venda entre duas áreas.

2. **Mesmo filtro de "vendas concluídas no período" do resto do framework** (status `COMPLETED`/
   `PARTIALLY_REFUNDED`, excluindo canceladas e totalmente reembolsadas, `refunded >= total`),
   restrito a `channel = DELIVERY` — os demais canais (PDV, Salão) não têm área de entrega e ficam de
   fora deste relatório por definição.

3. **Pedidos de delivery sem área vinculada não são descartados: viram a linha "Sem área definida"**
   (`NO_DELIVERY_AREA_LABEL` em `lib/reports/sales-by-delivery-area.ts`), participando do total geral
   normalmente e do critério de ordenação — exatamente como pedido pelo dono do produto. Isso cobre o
   delivery avulso, sem bairro cadastrado, que continua sendo uma operação legítima e comum (ver ADR
   0028, decisão 5: a escolha da área é sempre opcional na criação do pedido).

4. **"Valor de produtos" é `Sale.subtotal` (sem a taxa) e "total de taxas de entrega" é
   `Sale.deliveryFee`, ambos já denormalizados na venda** (ADR 0028, decisão 4: `Sale.subtotal` nunca
   inclui `deliveryFee`; `Sale.deliveryFee` é o snapshot da taxa cobrada no fechamento). Não foi
   necessário ler `DeliveryOrder.deliveryFee` para o valor — só `DeliveryOrder.deliveryAreaId` (e o
   nome da área, via `DeliveryArea.name`) para saber a QUAL área agrupar. "Valor total geral" é a
   soma direta de produtos + taxa (sem rateio de desconto/reembolso specific à área, mesma
   simplificação já aceita pelo ADR 0035 para forma de pagamento).

5. **`SaleRecord.deliveryAreaId`/`deliveryAreaName`/`deliveryFee` estendidos em
   `lib/reports/sales.ts`**, opcionais e ignorados pelos demais relatórios, seguindo o mesmo padrão
   já usado por `operatorId`/`operatorName` (ADR 0034) e `payments` (ADR 0035). No modo servidor vêm
   do `include: { deliveryOrder: { include: { deliveryArea: true } } }` da consulta a `Sale`
   (`app/api/admin/reports/sales-by-delivery-area/route.ts`). No modo local, o evento de auditoria
   `SALE_COMPLETE` (`app/api/operations/sales/route.ts`) passou a gravar `deliveryAreaId`/
   `deliveryAreaName`/`deliveryFee` também — antes só gravava `deliveryOrderId`, sem o snapshot da
   área/taxa; `lib/local-finance.ts` (`listLocalSalesForReport`) foi ajustado para propagar os três
   campos novos do evento para o `SaleRecord`, mesmo padrão dos campos opcionais anteriores.

6. **Cálculo puro isolado em `lib/reports/sales-by-delivery-area.ts`**, mesmo padrão de
   `lib/reports/payment-methods.ts`/`staff-performance.ts`: formato de linha (por área de entrega)
   diferente o bastante para justificar arquivo próprio. Linhas ordenadas por valor total geral
   decrescente.

7. **Sem persistência nova**, mesmo padrão de todo o framework — somente leitura calculada sob
   demanda a partir de `Sale`/`DeliveryOrder`/`DeliveryArea` (modo servidor) ou do log de auditoria
   local (modo local).

8. **Nova permissão granular `reports.sales_by_delivery_area.view`**, mesmo padrão
   `reports.<slug>.view` do ADR 0033, registrada em `lib/permissions.ts`, incluída em
   `OWNER_PERMISSIONS`, propagada ao array padrão de `permissionKeys` do modo local
   (`lib/local-auth.ts`) e concedida a todo `CustomRole` com `systemTemplate = true` pela migração
   `20260929090000_relatorio_vendas_por_area_de_entrega`, mesmo padrão das migrações anteriores.

9. **UI: uma única tabela (`ReportTable`)** com colunas Área de entrega, Qtde. de pedidos, Valor de
   produtos, Total de taxas de entrega e Valor total geral, e rodapé com os quatro totais — mesmo
   padrão de uma seção única já usado por Vendas por forma de pagamento (ADR 0035).

## Consequências

- Área de entrega sem nenhum pedido de delivery no período simplesmente não aparece na tabela (mesmo
  comportamento de "forma de pagamento sem pagamento" do ADR 0035); "Sem área definida" só aparece
  quando existe ao menos um pedido de delivery sem área vinculada no período.
- Se uma `DeliveryArea` for inativada ou tiver seu nome/taxa alterados depois de um pedido concluído,
  o relatório mostra o nome e a taxa gravados no momento do pedido (snapshot), sem retroatividade —
  mesma garantia já dada pelo ADR 0028.
- Nenhuma dependência nova, nenhum relatório existente muda de comportamento — apenas `SaleRecord`
  ganhou três campos opcionais adicionais.
