# ADR 0026: Relatório de CMV real

- Estado: aceito
- Data: 2026-09-16

## Contexto

CMV (Custo de Mercadoria Vendida) é o custo real dos insumos consumidos pelas vendas de um período, comparado com a receita, para chegar na margem bruta real. O sistema já tinha todos os dados necessários para calcular isso, espalhados em três lugares:

- `StockMovement.unitCost` (ADR de Notas de entrada, 0020) — o único lugar onde o custo real de aquisição de um insumo fica registrado, preenchido em entradas manuais (`ENTRY` com `totalCost` informado) e em notas de entrada confirmadas (`GoodsReceiptItem.unitCost`).
- `Recipe`/`RecipeComponent` — a ficha técnica de um produto, que diz quanto de cada `InventoryItem` uma venda consome, com `wastePercent`.
- `Sale`/`SaleItem` — vendas concluídas, com `recipeSnapshot` (retrato da receita usada no momento da venda, se existir) e `total`/`quantity`/`unitPrice`.

Faltava só juntar essas três peças num relatório. Esta fatia não cria nenhuma tabela nova — é inteiramente um cálculo sob demanda a partir de dados já existentes.

**Gap encontrado e corrigido como pré-requisito**: em modo local (`lib/local-inventory.ts`), o `totalCost` já era aceito pelo schema de validação da rota (`app/api/admin/inventory/route.ts`, ação `ENTRY`) e pela UI (`InventoryManagement.tsx` já tinha o campo "Custo total (opcional)"), mas nunca era repassado para `addLocalStockEntry` — o modo local simplesmente descartava o custo informado. O mesmo valia para a confirmação de notas de entrada em modo local (`addLocalStockEntryByEstablishmentItemId` não recebia `unitCost`, embora `GoodsReceiptItem.unitCost` já existisse). Sem isso, o Relatório de CMV seria inútil em modo local (nunca haveria custo registrado). Corrigido: `LocalStockMovement` ganhou o campo `unitCost?: number | null`, e as duas funções de entrada passaram a recebê-lo e gravá-lo. Isso é estritamente aditivo — não muda nenhum comportamento de saldo, só passa a registrar um dado que já era coletado e perdido.

## Decisões

1. **Custo médio ponderado por item de estoque por unidade (`establishmentItemId`/`InventoryRecord` + estabelecimento), usando TODO o histórico de entradas com custo, não só o período do relatório.** Fórmula: `custoMedio = soma(quantidade × custoUnitário) / soma(quantidade)`, considerando apenas movimentos `ENTRY` com `unitCost` preenchido. Não é FIFO nem custo por lote — é uma média simples de tudo que já entrou com custo conhecido, recalculada a cada consulta do relatório (não é armazenada). Documentado como simplificação aceita nesta fatia.

2. **Item sem nenhuma entrada com custo registrado tem custo médio `null` (desconhecido) — nunca 0.** A função pura `weightedAverageCost` (`lib/cmv.ts`) retorna `null` quando não há nenhuma entrada válida. Isso se propaga: um componente de receita com custo desconhecido faz a venda daquele produto ser marcada `hasUnknownCost: true`, e o CMV daquele produto soma só os componentes com custo conhecido (nunca finge que o componente desconhecido custou zero). A UI destaca visualmente ("custo parcial") qualquer produto nessa situação.

3. **Vendas sem ficha técnica não entram no CMV — aparecem à parte, com quantidade e receita, sem custo.** Não há como saber o custo de um produto sem `RecipeComponent`s, então tentar estimar seria inventar um número. A UI mostra esses produtos numa seção "Vendas sem ficha técnica" separada da tabela principal, para o dono saber que aquela receita ainda não é rastreada.

4. **CMV% e Margem% são calculados sobre a Receita TOTAL do período (incluindo vendas sem ficha técnica), não só sobre a receita rastreada.** Decisão de produto tomada nesta fatia: assim o dono vê o peso real do CMV conhecido sobre tudo que foi vendido — o CMV desconhecido não é tratado como 0 (ele simplesmente fica fora do numerador, e a lista de "vendas sem ficha técnica" deixa claro que parte da receita não tem custo rastreado ainda). Alternativa considerada e descartada: CMV% só sobre a receita com ficha técnica — rejeitada por poder mascarar quanto da operação total ainda não tem custo rastreado.

5. **Aproximação temporal explícita: usa-se o custo médio "atual" (calculado no momento da consulta) mesmo para vendas passadas do período.** Não existe custo histórico por data nesta fatia — se o preço de compra de um insumo mudou entre o início e o fim do período (ou depois dele), o relatório recalcula com o custo médio de HOJE, não o custo médio vigente em cada data de venda. Isso é uma aproximação aceitável para esta fatia (evita ter que reconstituir "o custo médio como era em cada dia"), mas é uma limitação real: o CMV de um período fechado pode mudar se consultado de novo mais tarde, após novas entradas de estoque. Sinalizado na UI, não só na documentação.

6. **Modo local não tem `recipeSnapshot` por `SaleItem` — a ficha técnica ATUAL do produto é usada para reconstituir o consumo de cada linha de venda passada**, a partir dos itens registrados no evento de auditoria `SALE_COMPLETE` (`after.items`, já usado pelo Fluxo de caixa local, ADR 0016). Isso soma outra aproximação temporal à já descrita na decisão 5 (ficha atual, não a ficha vigente no momento da venda) — aceitável pelo mesmo motivo, e só existe porque o modo local nunca gravou o retrato de receita por venda (diferente do servidor). Se o produto não tiver mais ficha técnica cadastrada hoje (ou nunca teve), a venda cai em "sem ficha técnica" mesmo que tivesse uma no passado — limitação aceita.

7. **Permissão: `finance.summary.view` (visão financeira consolidada), não `stock.manage`.** CMV cruza estoque e financeiro, mas o relatório é fundamentalmente uma visão gerencial de margem — o mesmo público que já vê o Fluxo de caixa (`finance.cashflow.view`, ADR 0016) e o Resumo financeiro. Quem só gerencia estoque no dia a dia (`stock.manage`) não necessariamente deveria ver margem/lucratividade da operação. Reaproveita o padrão de `resolveActor` do Fluxo de caixa (`app/api/admin/finance/cashflow/route.ts`).

8. **Rota `GET /api/admin/inventory/cmv-report`, aceitando `from`/`to` opcionais (default: mês corrente, via `defaultMonthRange` de `lib/cashflow.ts`)**, mesmo padrão de período usado no Fluxo de caixa e no Histórico de posição de estoque. Sem paginação — o volume esperado (produtos distintos vendidos num período) é pequeno o bastante para não precisar.

9. **Cálculo extraído para funções puras em `lib/cmv.ts`** (`weightedAverageCost`, `calculateSaleItemCmv`, `buildCmvReport`), testadas diretamente (`tests/cmv.test.ts`), sem depender de HTTP nem de Prisma/local. A rota só busca dados (Prisma ou local) e monta os inputs para essas funções — nenhuma lógica de negócio na rota.

10. **Nova sub-aba "Relatório de CMV" em `InventoryManagement.tsx`**, entre "Histórico de posição" e "Lista de compras", com o mesmo padrão de filtro de período com atalhos (Hoje/Esta semana/Este mês) do Fluxo de caixa, cards de resumo (`.metric-cards`/`.role-card`, reaproveitados) e uma tabela de detalhamento por produto ordenada por CMV decrescente. Produtos com custo parcial (algum componente sem custo conhecido) e a seção de "vendas sem ficha técnica" são destacados visualmente (borda laranja + selo).

## Consequências

- Nenhuma tabela nova. O relatório é 100% derivado de `StockMovement`, `Sale`/`SaleItem` e `Recipe`/`RecipeComponent` já existentes.
- Modo local passou a registrar `unitCost` em entradas de estoque (manuais e por nota de entrada confirmada) — antes esse dado era coletado na UI/API e descartado. Isso não muda nenhum comportamento de saldo/consumo, só deixa de perder informação de custo.
- O relatório é uma aproximação por natureza (custo médio "atual", ficha atual em modo local) — não é uma contabilidade de custo histórico rigorosa (não é FIFO, não versiona custo por data). Isso está documentado nesta ADR e sinalizado na própria UI (aviso de custo parcial quando aplicável, texto explicando a limitação temporal no cabeçalho da tela).
- Fatia futura, fora de escopo aqui: "Análise/simulação de CMV" (ex.: simular impacto de mudar o preço de um insumo, precificação sugerida por margem-alvo) — não implementada nesta fatia.
