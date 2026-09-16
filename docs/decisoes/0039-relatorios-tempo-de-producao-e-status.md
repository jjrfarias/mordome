# ADR 0039: Relatórios "Tempo de produção" e "Tempo por status"

- Estado: aceito
- Data: 2026-09-16

## Contexto

O ADR 0033 (framework de relatórios) já citava "tempo de produção" entre os relatórios do menu
original fora de escopo naquela fatia. Esta fatia entrega DOIS relatórios operacionais sobre a
cozinha, construídos juntos por compartilharem a mesma fonte de dados e lógica de extração:
`OrderStatusHistory` (modo servidor) / `LocalOrder.statusHistory` (modo local) — o histórico de
transições de status de cada `Order` (`RECEIVED → PREPARING → READY → DELIVERED`, ou `CANCELLED` a
qualquer momento).

- **Tempo de produção**: por PEDIDO, quanto tempo entre o envio à cozinha (`sentAt`) e ele ficar
  pronto (primeira transição para `READY`).
- **Tempo por status**: agregado do período (não por pedido), tempo médio que os pedidos passam em
  cada status antes de sair dele — Recebido até Em preparo, Em preparo até Pronto, Pronto até
  Entregue.

## Decisões

1. **Lógica de extração compartilhada em `lib/reports/order-timing.ts`.** Os dois relatórios olham
   para o mesmo dado bruto — histórico de status ordenado cronologicamente por pedido — mas
   calculam coisas diferentes. Para não duplicar "quanto tempo entre a transição X e a transição Y",
   esse módulo expõe:
   - `OrderTimingRecord` — um pedido normalizado (`orderId`, `tableLabel`, `history` ordenado
     ascendente, primeiro evento sempre `RECEIVED`).
   - `computeConsecutiveDurations(record)` — duração de cada par de transições consecutivas do
     histórico de um pedido (função pura, testada isoladamente).
   - `findFirstStatusEvent(record, status)` — primeira ocorrência de um status no histórico.
   - `shortOrderLabel(orderId)` — identificador curto (últimos 6 caracteres, maiúsculo) para exibir
     na tabela sem o cuid inteiro.

   `lib/reports/production-time.ts` e `lib/reports/time-by-status.ts` importam desse módulo comum e
   implementam cada um sua própria função `build*`/`summarize*`, sem duplicar a extração.

2. **"Tempo de produção" usa `findFirstStatusEvent`, não `computeConsecutiveDurations`.** O tempo de
   produção é o intervalo entre o primeiro evento (RECEIVED, equivalente a `sentAt`) e o primeiro
   READY — não a soma das durações intermediárias (que seriam a mesma coisa matematicamente, já que
   as transições são lineares, mas calcular direto do primeiro/último evento é mais simples e não
   depende de nenhuma transição intermediária ter sido pulada).

3. **Pedidos sem transição para READY no período são excluídos do relatório de tempo de produção**,
   tanto das linhas quanto da média — não há um "tempo decorrido até agora" bem definido para um
   pedido ainda em preparo (o relatório é sobre um período fechado, não sobre o estado atual da
   cozinha, que já tem sua própria tela ao vivo — Salão/KDS). Cancelados sem nunca terem ficado
   prontos também ficam fora, pelo mesmo motivo (nunca tiveram um instante de "pronto" para medir).
   Em vez de simplesmente escondê-los, a função `buildProductionTimeRows` devolve também
   `inProgressCount` (quantos pedidos do período caíram nesse caso), exibido no rodapé como "Ainda
   em andamento / não concluídos no período" — decisão mais simples do que reconstituir uma tabela
   separada de pedidos incompletos, mas sem esconder que eles existem.

4. **"Tempo por status" mede só `RECEIVED`, `PREPARING`, `READY` como status de origem** — são os
   três que têm um "tempo até a próxima etapa" com sentido de negócio (pedido do produto: "Recebido
   até virar Em preparo, Em preparo até Pronto, Pronto até Entregue"). `DELIVERED` e `CANCELLED` são
   estados finais, sem transição de saída a medir. Uma transição `RECEIVED → CANCELLED` (pedido
   cancelado ainda em preparo) CONTA como tempo passado em `RECEIVED` — o pedido genuinamente esperou
   aquele tempo nesse status antes de sair dele, independente de para onde foi depois; excluir essas
   transições sub-representaria o tempo real gasto em cada etapa.

5. **Modo servidor**: consulta única `db.order.findMany({ where: { sentAt: { gte, lte }, tab:
   { establishmentId } }, include: { tab: { include: { table: true } }, statusHistory: { orderBy:
   { createdAt: "asc" } } } })` para os dois relatórios — filtra por `sentAt` (quando o pedido foi
   enviado), não pela data das transições de status em si, então um pedido enviado no fim do
   período mas concluído já fora dele ainda entra (e pode aparecer como "ainda em andamento" se não
   tiver chegado a READY dentro do próprio período consultado, decisão 3).

6. **Modo local exigiu adicionar rastreamento de histórico de status**, que não existia em
   `lib/local-floor.ts` antes desta fatia (o módulo só guardava o status atual do pedido, não as
   transições). Mudanças:
   - `LocalOrder` ganhou o campo `statusHistory: { status, actorId, createdAt }[]`.
   - `sendLocalOrder` grava o evento inicial `RECEIVED` no mesmo instante do `sentAt` — mesmo
     comportamento do modo servidor (`Order` sempre nasce com um `OrderStatusHistory` de `RECEIVED`
     na mesma transação do envio).
   - `changeLocalOrderStatus` passou a exigir `actorId` (antes não recebia) e grava um novo evento a
     cada transição válida.
   - `cancelLocalSentItem` grava um evento `CANCELLED` quando o cancelamento total dos itens leva o
     pedido a esse status — mesma paridade do modo servidor
     (`app/api/operations/floor/route.ts`, `cancelSentItem`).
   - Nova função somente-leitura `listLocalOrderTimings(establishmentId, from, to)`, que varre todas
     as mesas/comandas (abertas ou já fechadas — comandas pagas continuam na lista, nunca são
     removidas) e devolve, para cada pedido enviado dentro do período, seu histórico de status
     normalizado. Não recebe nem devolve a fatia `data` do módulo — só objetos novos.

7. **Duas permissões granulares novas**, mesmo padrão `reports.<slug>.view`: `REPORTS_PRODUCTION_TIME_VIEW
   = "reports.production_time.view"` e `REPORTS_TIME_BY_STATUS_VIEW = "reports.time_by_status.view"`,
   registradas em `lib/permissions.ts`, incluídas em `OWNER_PERMISSIONS`, propagadas ao array padrão
   de `permissionKeys` do modo local (`lib/local-auth.ts`) e concedidas a todo `CustomRole` com
   `systemTemplate = true` por uma única migração (`20261002090000_relatorios_tempo_de_producao_e_status`)
   que insere as duas permissões — mesmo padrão das migrações anteriores desta série.

8. **UI: uma tabela por relatório (`ReportTable`)**, ambos reaproveitando `PeriodFilter` e
   `lib/reports/export.ts`, mesmo padrão do restante do framework.
   - "Tempo de produção": colunas Pedido (identificador curto), Mesa, Enviado à cozinha, Pronto,
     Tempo de produção (mm:ss); rodapé com pedidos concluídos, tempo médio e quantos ficaram de fora
     ("ainda em andamento / não concluídos").
   - "Tempo por status": colunas Status (traduzido: Recebido/Em preparo/Pronto), Tempo médio nesse
     status, Nº de pedidos que passaram por essa transição. Sem rodapé — cada linha já é uma média
     geral, não há um "total" adicional que faça sentido somar entre status diferentes.

## Consequências

- Nenhuma tabela nova no schema (`Order`/`OrderStatusHistory` já existiam) — só um campo novo na
  estrutura em memória do modo local.
- Qualquer relatório futuro sobre tempo de transição de pedido (ex.: tempo de entrega, tempo de
  atendimento) pode reaproveitar `lib/reports/order-timing.ts` sem duplicar a extração de durações.
- `changeLocalOrderStatus` é uma mudança de assinatura (`actorId` passou a ser obrigatório) — todos
  os chamadores internos (rota do salão, testes) foram atualizados nesta mesma fatia.
