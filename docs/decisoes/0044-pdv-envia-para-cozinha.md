# ADR 0044: PDV rápido passa a enviar o pedido para a cozinha

- Estado: aceito
- Data: 2026-09-17

## Contexto

Feedback real do cliente (Betão Hot Dog) ao testar o sistema: uma venda feita no PDV rápido
(balcão) não aparecia em nenhuma outra aba, e a cozinha não ficava sabendo o que preparar. Ao
investigar, confirmado no código: o PDV (`channel: "POS"`) sempre finalizou a venda direto —
`Sale` criada, pagamento processado, recibo do cliente impresso — sem nunca criar um `Order`
(pedido de cozinha). Esse fluxo só existia para o Salão (`Tab`/`TabItem`/`Order`, ação
`SEND_ORDER`), nunca para o PDV.

Isso é um defeito real de produto, não uma limitação aceitável: numa lanchonete de balcão, o
caixa cobra mas ninguém avisa o cozinheiro/chapeiro o que fazer.

## Decisão

**Integração completa**: o PDV passa a reaproveitar o mesmo pipeline Tab → Order → OrderItem já
usado pelo Salão, para que o pedido apareça na aba Cozinha com o mesmo rastreio de status
(RECEIVED → PREPARING → READY → DELIVERED) e a mesma impressão por fila de preparo — em vez de um
recurso "paralelo" e mais simples (só imprimir um tíquete, sem rastreio). Motivo: a reclamação do
cliente foi explicitamente "não identificamos ele em outra aba" — só imprimir não resolveria isso.

### Mesa virtual "Balcão"

`Order`/`OrderItem`/`Tab`/`TabItem` são modelados em cima de `DiningTable` (`Tab.tableId` é
obrigatório) — não dá para criar um `Order` sem uma mesa e uma comanda por trás. Em vez de mudar
esse modelo (arriscado, usado por todo o Salão), a solução foi acrescentar
`DiningTable.isCounter: Boolean @default(false)`: uma mesa "virtual" por estabelecimento,
encontrada ou criada sob demanda na primeira venda do PDV (`number: 0`, `name: "Balcão"`,
`seats: 0`, `isCounter: true`), nunca exibida na grade de mesas do Salão nem no seletor de mesas
do Salão (ambos passam a filtrar `isCounter: false`).

### Uma comanda por venda, nunca fechada por status

Ao contrário do Salão (uma comanda por mesa física, que precisa ser fechada para liberar a mesa
para o próximo cliente), a mesa virtual não é um recurso físico — não há necessidade de "liberar"
nada. Cada venda do PDV cria sua PRÓPRIA `Tab` (não reaproveita uma comanda aberta anterior, ao
contrário do que `ADD_ITEM` do Salão faz), já com `saleId` apontando para a venda recém-criada e
**`status: "OPEN"` para sempre** — nunca fechada. Isso foi decisão deliberada, não descuido: as
funções que avançam o status do pedido (`changeOrderStatus`, no servidor e em modo local) exigem
`tab.status === "OPEN"` para aceitar a mudança — se a comanda do balcão fosse fechada
imediatamente (como acontece no Salão, pagamento só depois de comer), a cozinha ficaria impedida
de avançar o pedido pelas etapas depois que o cliente já pagou (que é exatamente a ordem normal
no balcão: paga primeiro, prepara depois). A tela de Cozinha para de mostrar o pedido assim que
ele chega a `DELIVERED`/`CANCELLED` (mesmo filtro que já existia), então a comanda "eternamente
aberta" não aparece de novo em lugar nenhum depois disso — só fica como registro histórico
inerte, sem custo prático.

### Consulta de Cozinha: pedidos de balcão são uma lista à parte, não uma "mesa com comanda"

A consulta existente (`GET /api/operations/floor`) carrega, por mesa, a comanda `OPEN` mais
recente (`tabs: { take: 1 }`) — pensada para "uma comanda aberta por vez, por mesa física". A
mesa virtual do balcão pode ter DEZENAS de comandas abertas simultaneamente (uma por venda), o
que quebra essa suposição. Em vez de forçar isso no mesmo formato, a rota ganhou uma consulta
SEPARADA e adicional (`loadCounterOrders`), que busca todos os pedidos de balcão ainda não
finalizados e os mistura na mesma lista `orders` (usada só pela tela de Cozinha, nunca pela grade
de mesas do Salão, que continua ignorando `isCounter: true` por completo). Em modo local
(`lib/local-floor.ts`), o mesmo problema foi resolvido de forma ainda mais simples, sem reusar
`DiningTable`/`Tab` nenhum: uma lista `counterOrders` própria por estabelecimento.

### Impressão do tíquete de cozinha

Ao concluir a venda, a mesma transação que cria a `Sale` também cria a `Tab`/`TabItem`s/`Order`/
`OrderItem`s do balcão (atomicidade: se a parte da cozinha falhar, a venda inteira falha — nunca
cobra sem avisar a cozinha). A resposta da rota devolve os tíquetes já agrupados por fila de
preparo (mesmo critério do Salão: produto sem fila configurada não gera tíquete), e a tela do PDV
(`app/page.tsx`) chama `printKitchenOrder` para cada fila com impressora `browser_print`
configurada, do mesmo jeito que o Salão já faz ao enviar um pedido — só que automaticamente, sem
precisar de um botão "enviar para cozinha" separado (o botão de finalizar a venda já cumpre esse
papel no PDV).

`printKitchenOrder` (`lib/integrations/print-client.ts`) tinha o parâmetro `table: number`
("MESA NN" fixo no cabeçalho do tíquete); virou `label: string` para aceitar tanto `Mesa NN`
(Salão) quanto `Balcão` (PDV) sem duplicar a função de impressão.

### Tela de Cozinha mostra "Balcão" em vez de "Mesa 0"

`KitchenView` (`components/operations/FloorManagement.tsx`) e os relatórios "Tempo de produção"/
"Tempo por status" (ADR 0039) passam a checar `order.isCounter`/`table.isCounter` e mostrar
"Balcão" em vez do número da mesa virtual.

## Fora de escopo desta fatia

- **Delivery tem o mesmo problema** (pedidos de delivery também não geram tíquete de cozinha
  hoje) — não corrigido aqui por decisão explícita: o pedido do cliente foi especificamente sobre
  o PDV. Fica registrado como próxima pendência natural, mesma solução (mesa virtual própria,
  ex. `isCounter`-like flag ou reaproveitando a mesma mesa "Balcão").
- **Cancelamento/edição de item já enviado** (`CANCEL_SENT_ITEM`) não foi ligado ao pedido de
  balcão — cancelar uma venda do PDV depois de paga usa o fluxo de Cancelamento/Reembolso de
  `Sale` já existente (ADR de vendas), não a cozinha.
