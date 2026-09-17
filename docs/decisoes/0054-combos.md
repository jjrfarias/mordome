# ADR 0054: Combos (fixos e com escolha)

- Estado: aceito
- Data: 2026-09-17

## Contexto

O dono pediu para montar combos ("Combo Smash" = 1 hot dog + 1 batata + 1 refrigerante por um
preço fechado) e também combos onde o cliente escolhe entre opções ("escolha 1 lanche entre 3").
Pediu explicitamente que isso ficasse dentro da tela de Cardápio, como se estivesse criando um
produto comum, só marcando que aquele produto "é um combo".

## Decisão

1. **Um combo é um `Product` normal com `isCombo = true`**, não uma entidade separada — mesma
   `ProductVariant`/`ProductOffering` por canal/estabelecimento que qualquer produto já usa, então
   preço, canais habilitados e foto funcionam exatamente igual. `isCombo` é decidido na criação e
   não é editável depois (evita o caso de "desmarcar combo" deixar grupos órfãos).

2. **`ComboGroup`/`ComboGroupOption` são estruturalmente idênticos a `IngredientGroup`/
   `IngredientOption` (ADR 0022)**, com uma diferença: cada opção aponta para OUTRO `Product`
   inteiro (`ComboGroupOption.productId`) em vez de ter nome/preço próprios — nome e disponibilidade
   são sempre lidos do produto referenciado (nunca duplicados/congelados). Um grupo com uma única
   opção ativa e `minSelections = maxSelections = 1` é, na prática, um combo fixo (sem escolha real);
   um grupo com várias opções é a "escolha do seu jeito". A mesma estrutura cobre os dois formatos
   pedidos, sem precisar de dois modelos diferentes.

3. **Reaproveita 100% do pipeline de personalização já existente, sem tocar em `Sale`/`TabItem`/
   `DeliveryOrderItem`.** `lib/combo-catalog.ts` mapeia `ComboGroup[]` para o mesmo formato de
   `IngredientGroup[]` que `resolveIngredientSelections` (`lib/ingredient-options.ts`, ADR 0022) e
   `IngredientPicker` (componente compartilhado por PDV/Salão/Delivery/Pedido online) já sabem ler —
   um combo com grupos vira, do ponto de vista do carrinho, um produto com "grupos de ingrediente"
   cujas opções têm nome de outro produto. O combo vende como UMA linha (`SaleItem`/`TabItem`/
   `DeliveryOrderItem`) no preço do combo (não a soma dos produtos escolhidos), com
   `selectedOptionsSnapshot` registrando o que foi escolhido em cada grupo — mesmo campo/formato já
   usado para ingredientes, nenhuma coluna nova nesses três modelos.

4. **Consumo de estoque/ficha técnica não é decomposto por combo nesta fatia** — o combo, se tiver
   ficha técnica (`Recipe`) própria configurada, consome normalmente; se não tiver, não consome nada
   (mesmo comportamento de um produto qualquer sem ficha). Decompor o consumo pelos produtos
   escolhidos dentro do combo (ex.: descontar estoque do hot dog E da batata escolhidos) fica como
   pendência futura, registrada aqui — o dono precisa cadastrar uma ficha técnica no próprio combo se
   quiser controle de estoque agora.

5. **`GET /api/admin/catalog/combo-groups`** é o CRUD de grupos/opções do combo, mesmo desenho de
   `GET /api/admin/catalog/groups` (grupos de ingrediente) — só troca nome/priceDelta livre por
   `optionProductId` (obrigatoriamente um produto ativo, `isCombo = false`, da mesma organização,
   nunca outro combo — sem combo aninhado nesta fatia).

6. **Todos os quatro canais** (PDV, Salão, Delivery interno, Pedido online) passaram a resolver
   `ingredientGroups` (incluindo os derivados de combo) no servidor antes de finalizar a
   venda/pedido — Pedido online não tinha NENHUM suporte a grupos de ingrediente antes desta fatia
   (só quantidade por produto); ganhou nesta mesma entrega um carrinho por linha (`cartLineId`, mesmo
   padrão do PDV) e o `IngredientPicker` embutido, para combos com escolha funcionarem lá também.

7. **`IngredientPicker` pré-seleciona automaticamente grupos com uma única opção ativa** — um grupo
   assim não é uma escolha real (é o caso do combo fixo), então obrigar o cliente a marcar um radio
   sem alternativa seria atrito sem propósito. Mudança válida para qualquer grupo de ingrediente,
   não só combo.

## Consequências

- Cardápio ganha um checkbox "Este produto é um combo" na criação; produtos marcados mostram um
  editor de grupos/opções ("Produtos do combo") em vez do editor de grupos de ingrediente.
- Pedido online deixou de ser "só quantidade por produto" — agora suporta o mesmo fluxo de
  personalização que PDV/Salão/Delivery, preparando terreno para outras customizações futuras
  (ex.: ingredientes normais) na loja pública, não só combos.
- Sem decomposição de estoque por item do combo: relatórios de consumo de insumos não enxergam o
  que foi escolhido dentro de um combo, só o combo em si (e sua própria ficha técnica, se houver).
