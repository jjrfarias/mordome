# ADR 0037: Relatório "Itens vendidos"

- Estado: aceito
- Data: 2026-09-16

## Contexto

O ADR 0033 entregou o framework de relatórios e deixou "itens vendidos" fora de escopo, junto com
outros relatórios do menu original. Esta fatia entrega esse relatório, reaproveitando integralmente
a base do framework (permissão granular, catálogo central, `ReportTable`, exportação,
`PeriodFilter`): para um período, agrupa os itens (`SaleItem`) das vendas concluídas por PRODUTO,
mostrando posição no ranking, nome do produto, quantidade total vendida, receita total e preço médio
praticado.

## Decisões

1. **Agregação por ITEM DE VENDA (`SaleItem`), agrupada por produto** — ao contrário de Vendas por
   área de entrega (ADR 0036, que agrega por venda), cada item de cada venda concluída no período
   contribui para o total do seu produto, somando `quantity` e `quantity × unitPrice`. Itens de uma
   mesma venda com produtos diferentes vão para linhas diferentes; itens do mesmo produto em vendas
   diferentes se acumulam na mesma linha.

2. **Mesmo filtro de "vendas concluídas no período" do resto do framework** (status
   `COMPLETED`/`PARTIALLY_REFUNDED`, excluindo canceladas e totalmente reembolsadas, `refunded >=
   total`), sem restrição de canal — PDV, Salão e Delivery contribuem igualmente, já que o relatório
   é sobre produtos, não sobre a venda em si.

3. **"Receita total" é a soma bruta de `quantity × unitPrice` de cada item, sem descontar
   reembolso** — mesma simplificação já aceita pelos ADRs 0035/0036 (nenhum rateio de reembolso
   parcial entre os itens de uma venda). Reembolso parcial não indica qual item foi devolvido, então
   continuamos a mesma regra: só a venda totalmente reembolsada é excluída (decisão 2), o resto
   entra pelo valor cheio.

4. **Agrupamento por nome do produto (`SaleItem.productName`), não por `productId`** — o item de
   venda já grava o nome do produto no momento da venda (snapshot, sem join com `Product`), mesmo
   padrão usado pelos demais campos de `SaleItem`. Como o nome pode não ser único ao longo do tempo
   (produto renomeado) nem sempre há `productId` presente (nem toda linha de venda referencia um
   produto do catálogo vivo), o agrupamento simples por texto do nome é suficiente para o caso de
   uso — mesmo espírito do ADR 0036, que aceita snapshot em vez de join retroativo.

5. **"Preço médio praticado" é `receita total / quantidade total`**, não a média simples dos
   `unitPrice` distintos — dá o preço médio ponderado pela quantidade vendida, mais representativo
   quando o mesmo produto foi vendido a preços diferentes no período (variação de ingredientes
   opcionais, por exemplo).

6. **Ranking por posição** é simplesmente o índice (1-based) da linha já ordenada por receita total
   decrescente — não é uma coluna armazenada, é calculada na montagem das linhas (`rank: index + 1`).

7. **`SaleRecord.items` estendido em `lib/reports/sales.ts`**, uma lista opcional de
   `{ productName, quantity, unitPrice }` por item de venda, ignorada pelos demais relatórios,
   seguindo o mesmo padrão já usado por `operatorId`/`payments`/`deliveryAreaId` (ADRs 0034/0035/
   0036). No modo servidor vem do `include: { items: true }` da consulta a `Sale`
   (`app/api/admin/reports/items-sold/route.ts`). No modo local, o evento de auditoria `SALE_COMPLETE`
   (`app/api/operations/sales/route.ts`) já grava `items` com `productName`/`quantity`/`unitPrice`
   para todo canal (usado desde o framework original para outros fins) — só foi necessário propagar
   esses três campos do evento para `SaleRecord.items` em `lib/local-finance.ts`
   (`listLocalSalesForReport`), sem tocar em nenhuma gravação existente.

8. **Cálculo puro isolado em `lib/reports/items-sold.ts`**, mesmo padrão de
   `payment-methods.ts`/`sales-by-delivery-area.ts`: formato de linha (por produto, com ranking)
   diferente o bastante para justificar arquivo próprio. Linhas ordenadas por receita total
   decrescente.

9. **Sem persistência nova**, mesmo padrão de todo o framework — somente leitura calculada sob
   demanda a partir de `Sale`/`SaleItem` (modo servidor) ou do log de auditoria local (modo local).

10. **Nova permissão granular `reports.items_sold.view`**, mesmo padrão `reports.<slug>.view` do
    ADR 0033, registrada em `lib/permissions.ts`, incluída em `OWNER_PERMISSIONS`, propagada ao
    array padrão de `permissionKeys` do modo local (`lib/local-auth.ts`) e concedida a todo
    `CustomRole` com `systemTemplate = true` pela migração `20260930090000_relatorio_itens_vendidos`,
    mesmo padrão das migrações anteriores.

11. **UI: uma única tabela (`ReportTable`)** com colunas Posição, Produto, Quantidade vendida,
    Receita total e Preço médio, e rodapé com quantidade total e receita total — mesmo padrão de uma
    seção única já usado pelos relatórios anteriores desta série.

## Consequências

- Produto sem nenhum item vendido no período simplesmente não aparece na tabela.
- Se um produto for renomeado depois de vendas concluídas, o relatório mostra os nomes gravados no
  momento de cada venda (snapshot): vendas antes e depois da renomeação aparecem em linhas
  separadas, sem retroatividade — mesma garantia já dada pelos relatórios anteriores para outros
  snapshots (ex.: ADR 0036 para área de entrega).
- Nenhuma dependência nova, nenhum relatório existente muda de comportamento — apenas `SaleRecord`
  ganhou um campo opcional adicional (`items`).
