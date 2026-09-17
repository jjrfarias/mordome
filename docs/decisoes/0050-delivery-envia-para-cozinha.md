# ADR 0050: Delivery envia para a cozinha

- Estado: aceito
- Data: 2026-09-17

## Contexto

O ADR 0044 (PDV envia para a cozinha) já resolvia isso para o PDV, reaproveitando o pipeline
`Tab`/`Order`/`OrderItem` do Salão através da mesa virtual "Balcão" (`DiningTable.isCounter = true`).
O próprio ADR 0044 registrava Delivery como pendência: pedidos de delivery não geravam tíquete de
cozinha nenhum, então a equipe de cozinha não tinha como saber que um pedido de delivery precisava
ser preparado — descobria só quando o entregador ou o balcão avisava.

## Decisão

1. **`POST /api/operations/delivery` (ação `CREATE`) agora também cria a comanda/pedido na mesa
   "Balcão"**, no mesmo momento em que o pedido de delivery é criado — mesma mesa virtual e mesmas
   tabelas (`Tab`/`TabItem`/`Order`/`OrderItem`) do ADR 0044, para a Cozinha continuar sendo uma
   única tela agregando PDV, Salão e agora Delivery.

2. **Diferente do PDV, a comanda é criada no PEDIDO, não no pagamento.** No PDV, pedido e pagamento
   acontecem juntos (finaliza a venda e já é PDV); no Delivery, o pedido precisa ser preparado e
   saído para entrega ANTES de ser cobrado (`Checkout`/"Cobrar e concluir" só acontece depois de
   `OUT_FOR_DELIVERY`) — se o tíquete de cozinha só fosse criado no pagamento, a cozinha nunca
   saberia do pedido a tempo de prepará-lo. A comanda fica `OPEN` indefinidamente (mesmo critério do
   ADR 0044: nunca fechada por status), sem `saleId` até o pagamento acontecer — e mesmo aí não é
   obrigatório setá-lo, porque nada no fluxo de pagamento depende de ler essa comanda de volta.

3. **`DeliveryOrder.kitchenOrderId` (novo campo, `String? @unique`) guarda o `Order.id` criado**, só
   como referência para permitir cancelamento em cascata (decisão 4) — não é uma relação Prisma
   (sem `@relation`), para não exigir mudança nenhuma no modelo `Order`. Migração puramente aditiva
   (`ALTER TABLE ... ADD COLUMN` + índice único), sem perda de dados.

4. **Cancelar o pedido de delivery (`CHANGE_STATUS` para `CANCELLED`) cancela também o pedido de
   cozinha vinculado**, direto (`Order.status = CANCELLED` + `OrderStatusHistory`), sem passar pela
   máquina de transição normal da Cozinha (`RECEIVED -> PREPARING -> READY -> DELIVERED`, que nunca
   aceita `CANCELLED` como destino) — mesmo padrão do modo local, onde
   `cancelLocalCounterOrder` (`lib/local-floor.ts`) faz o cancelamento direto, chamado via callback
   de `changeLocalDeliveryStatus`.

5. **A Cozinha avança o pedido (RECEIVED → PREPARING → READY) de forma independente da logística de
   entrega (RECEIVED → PREPARING → OUT_FOR_DELIVERY → DELIVERED)** — são duas máquinas de status
   diferentes, sem sincronização entre si, de propósito: a cozinha decide quando o lanche está
   pronto; o delivery decide quando sai para entrega e quando é cobrado. Igual ao mundo real, onde
   quem prepara e quem entrega são funções distintas com ritmos próprios.

6. **Modo local**: `createLocalCounterOrder` (já existente, criado pelo ADR 0044) é reaproveitado
   sem mudança — chamado no momento da criação do pedido de delivery, com o `id` do pedido de
   cozinha gravado em `LocalDeliveryOrder.kitchenOrderId` via `attachLocalDeliveryKitchenOrder`.

## Consequências

- A tela Cozinha (`GET /api/operations/floor`) passa a listar pedidos de PDV, Salão e Delivery,
  todos através da mesma mesa virtual "Balcão" no caso de PDV/Delivery — sem exigir nenhuma mudança
  na tela em si, que já lia `orders` de forma agnóstica ao canal de origem.
- Pedido de delivery cancelado ANTES de a cozinha terminar o preparo agora cancela o tíquete
  correspondente automaticamente, evitando que a cozinha prepare um pedido que não vai mais sair.
- Sem sincronização entre o status da cozinha e o status do delivery: um pedido pode aparecer
  "Pronto" na Cozinha e ainda estar "Recebido" no quadro do Delivery até o atendente avançar
  manualmente — comportamento aceito, mesmo critério de independência entre telas do ADR 0044.
