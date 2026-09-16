# ADR 0038: Relatório "Itens consumidos"

- Estado: aceito
- Data: 2026-09-16

## Contexto

O ADR 0033 entregou o framework de relatórios e o ADR 0037 entregou "Itens vendidos" — ranking de
PRODUTOS finais vendidos por faturamento. Esta fatia entrega um relatório diferente, também fora de
escopo do ADR 0033: "Itens consumidos", sobre CONSUMO DE ESTOQUE — quanto de cada INSUMO
(`InventoryItem`) foi efetivamente baixado por vendas no período, via ficha técnica.

**Distinção importante com o Relatório de CMV (ADR 0026, `lib/cmv.ts`)**: os dois olham para o mesmo
fenômeno (consumo de insumo por venda), mas com propósitos e saídas diferentes.

- **CMV** é sobre CUSTO/DINHEIRO: cruza consumo com custo médio de aquisição (`StockMovement.unitCost`)
  para chegar em CMV%, margem bruta e margem% — "quanto eu gastei em R$ para vender isso".
- **Itens consumidos** (esta fatia) é sobre QUANTIDADE FÍSICA: soma direta das quantidades dos
  movimentos `StockMovement`/`LocalStockMovement` do tipo `CONSUMPTION` por insumo — "quanto de
  farinha/queijo/pão eu realmente gastei", em gramas/mililitros/unidades, sem nenhuma conversão para
  dinheiro. Não usa `unitCost`, não calcula CMV%, não precisa que o insumo tenha custo registrado.

Um dono pode querer usar este relatório mesmo sem nunca ter lançado custo de aquisição (caso em que o
Relatório de CMV mostraria "custo desconhecido" para tudo) — aqui a quantidade consumida aparece de
qualquer forma, porque `StockMovement.quantity` sempre existe, independente de `unitCost`.

## Decisões

1. **Agregação por `StockMovement`/`LocalStockMovement` do tipo `CONSUMPTION` apenas** — o consumo
   automático gerado por venda concluída, via ficha técnica (`calculateRecipeConsumption`,
   `lib/inventory-domain.ts`, aplicado em `app/api/operations/sales/route.ts` no servidor e em
   `applyLocalRecipeConsumption`, `lib/local-inventory.ts`, no modo local). `LOSS` (perda manual),
   `ADJUSTMENT` (contagem física/ajuste), `TRANSFER_IN`/`TRANSFER_OUT`, `REVERSAL` e
   `PRODUCTION_IN`/`PRODUCTION_OUT` NÃO entram — o relatório é especificamente sobre consumo real por
   venda, não sobre toda movimentação de estoque (que já tem sua própria tela, "Histórico de posição",
   ADR 0025).

2. **Agrupado por `inventoryItemId` (insumo do catálogo de estoque), não por nome** — diferente do
   ADR 0037 (que agrupa `SaleItem` por nome porque é um snapshot sem `productId` garantido), aqui o
   `StockMovement`/`LocalStockMovement` sempre referencia o insumo vivo (`establishmentItemId` →
   `InventoryItem`, ou `inventoryItemId` no modo local), sem snapshot. Agrupar pelo id evita duplicar
   linhas se o insumo for renomeado no meio do período — a linha sempre mostra o nome atual.

3. **Quantidade consumida é a soma do valor absoluto de `quantity`** — `CONSUMPTION` é sempre
   registrado como negativo (baixa de saldo), mas o relatório mostra como número positivo ("quanto foi
   consumido"), mesma lógica de sinal já documentada em `lib/local-inventory.ts`/schema Prisma.

4. **Sem soma de quantidade entre insumos no resumo** — insumos diferentes têm unidades diferentes
   (g/ml/un), então uma "quantidade total" agregada não faria sentido. O resumo do rodapé mostra
   apenas contagens: número de insumos distintos consumidos no período e número total de
   movimentações — que fazem sentido independente de unidade.

5. **Unidade exibida como símbolo (g/ml/un), traduzida na UI, não na API** — mesmo padrão do ADR 0025
   (decisão 5): a rota devolve o `baseUnit` bruto (`GRAM`/`MILLILITER`/`UNIT`) e
   `ItemsConsumedReport.tsx` traduz para o símbolo, reaproveitando o mesmo mapa `unitLabels` já usado
   em `InventoryManagement.tsx`.

6. **Cálculo puro isolado em `lib/reports/items-consumed.ts`** (`buildItemsConsumedRows`,
   `summarizeItemsConsumed`), mesmo padrão de todo o framework: sem Prisma/Next, recebe uma lista
   normalizada `ConsumptionMovementRecord[]` (`inventoryItemId`, `inventoryItemName`, `baseUnit`,
   `quantity`), testável isoladamente com `node --test`. Ordenado por quantidade consumida
   decrescente.

7. **Modo servidor**: `db.stockMovement.findMany({ where: { type: "CONSUMPTION", createdAt: { gte,
   lte }, establishmentItem: { establishmentId } }, include: { establishmentItem: { include:
   { inventoryItem: true } } } })` — filtra direto pela unidade ativa da sessão, sem precisar de
   `Sale`/`SaleItem` nesta consulta (o consumo já está registrado no próprio `StockMovement`,
   independente de reconstituir a venda).

8. **Modo local**: nova função somente-leitura `listLocalConsumptionMovements(establishmentId, from,
   to)` em `lib/local-inventory.ts`, que varre todos os itens do catálogo local e filtra os
   movimentos `CONSUMPTION` da configuração daquele estabelecimento dentro do período — mesmo espírito
   de `getLocalStockPositionHistory` (ADR 0025), mas sobre todos os insumos de uma vez, não um único
   item. Não recebe nem retorna a fatia `data` do módulo local (a função só lê `configuration.movements`
   e devolve objetos novos — nenhuma referência mutável é repassada para o chamador).

9. **Nova permissão granular `reports.items_consumed.view`**, mesmo padrão `reports.<slug>.view` do
   ADR 0033, registrada em `lib/permissions.ts`, incluída em `OWNER_PERMISSIONS`, propagada ao array
   padrão de `permissionKeys` do modo local (`lib/local-auth.ts`) e concedida a todo `CustomRole` com
   `systemTemplate = true` pela migração `20261001090000_relatorio_itens_consumidos`, mesmo padrão
   das migrações anteriores.

10. **UI: uma única tabela (`ReportTable`)** com colunas Posição, Insumo, Unidade, Quantidade
    consumida e Nº de movimentações, e rodapé com contagem de insumos e de movimentações — mesmo
    padrão de seção única já usado pelos relatórios anteriores desta série.

## Consequências

- Insumo sem nenhum consumo automático no período simplesmente não aparece na tabela.
- Nenhuma dependência nova, nenhuma tabela nova — cálculo 100% derivado de `StockMovement`/
  `LocalStockMovement` já existentes.
- Complementa (não substitui) o Relatório de CMV: quem quer saber "quanto gastei em R$" continua
  usando CMV; quem quer saber "quanto de cada insumo eu consumi fisicamente" usa este relatório —
  ambos podem ser consultados juntos sem depender um do outro (este nem exige custo registrado).
