# ADR 0043: Dashboards "Canais" e "Vendas por Data/Hora"

- Estado: aceito
- Data: 2026-09-16

## Contexto

O ADR 0042 entregou os dois primeiros dashboards ("Acompanhamento de vendas" e "Acompanhamento de
vendas multilojas") e deixou explícito, na decisão 7, que "Canais" e "Vendas por Data/Hora" ficavam
fora daquela fatia por não haver pedido explícito de recorte por vários dias. O dono pediu agora os
dois: um comparativo mais analítico de canais ao longo de um período, e um drill-down de horário
que não fica preso a um único dia. Este ADR é uma continuação direta do 0042 — não um módulo novo,
não uma nova arquitetura — por isso não reabre nenhuma das decisões estruturais já tomadas (Dashboards
continua sem tabela genérica/exportação, continua usando `recharts`, continua com permissão granular
por dashboard).

Optou-se por um ADR novo, em vez de editar o 0042, para manter o histórico claro: o 0042 documentou
squarely a decisão "dashboard = um dia só" (decisão 2) e a exclusão explícita destes dois dashboards
(decisão 7) — reabrir o mesmo arquivo para contradizer essas duas frases tornaria o documento
confuso de ler cronologicamente. Um ADR novo que referencia o 0042 e registra o que mudou é mais
fiel ao papel de ADR como registro histórico de decisão.

## Decisões

1. **Estes dois dashboards quebram a decisão 2 do ADR 0042 ("dashboard sempre olha para UM dia")
   deliberadamente.** "Canais" e "Vendas por Data/Hora" usam `PeriodFilter` (De/Até + atalhos Hoje/
   Esta semana/Este mês, `components/admin/PeriodFilter.tsx`) em vez do seletor de data única —
   olhar só para hoje não é suficiente para comparar a evolução de um canal ou para identificar um
   padrão de horário recorrente ("sexta à noite é sempre mais forte"), que só aparece observando
   vários dias. "Acompanhamento de vendas" e "Acompanhamento de vendas multilojas" continuam olhando
   para um dia só, sem nenhuma mudança — a decisão 2 do ADR 0042 permanece válida para eles.

2. **"Canais" (`components/admin/dashboards/ChannelsDashboard.tsx`) é mais analítico que o resumo
   de canal já embutido em "Acompanhamento de vendas"**: em vez de uma pizza de composição de um
   dia, mostra a evolução diária de cada canal (gráfico de barras empilhadas, uma cor por canal,
   mesma paleta de `app/globals.css` já usada pelo dashboard existente), cards de KPI por canal
   (faturamento total do período e % de participação — mesma lógica de "agregação com participação
   percentual" de `buildPaymentMethodsRows` em `lib/reports/payment-methods.ts`, mas por canal de
   venda, não por forma de pagamento) e uma tabela simples de ranking (sem `ReportTable`, já que
   Dashboards não exporta nada — mesmo padrão do ranking de unidades do dashboard multilojas).
   Cálculo puro em `lib/dashboards/channels.ts` (`buildChannelDailyRevenue`, `buildChannelKpis`,
   `rankChannels`), sem Prisma/Next, testável com `node --test`.

3. **"Vendas por Data/Hora" usa MÉDIA por hora ao longo do período, não um heatmap dia da semana ×
   hora.** `recharts` não tem um componente de heatmap nativo — construir um exigiria desenhar uma
   grade própria (SVG/CSS por célula, com escala de cor manual), fora do padrão declarativo
   (`<BarChart>`/`<PieChart>`) já usado por todos os outros gráficos do projeto, e sem o mesmo nível
   de maturidade/testes visuais que `recharts` já dá de graça (tooltip, responsividade). A
   alternativa mais simples prevista no pedido — barras por hora do dia, com a MÉDIA de faturamento
   agregada sobre todos os dias do período — reaproveita o mesmo `<BarChart>` de "Acompanhamento de
   vendas" (só troca a fonte de dados) e já entrega o objetivo do dono ("identificar os horários de
   pico recorrentes") sem introduzir um novo padrão visual. Fica registrado aqui como decisão
   explícita: um heatmap dia da semana × hora fica para uma revisão futura, caso a média por hora se
   mostre insuficiente na prática.
   - `buildHourlyAverageRevenue` (`lib/dashboards/sales-by-hour.ts`) soma o faturamento líquido por
     hora (0-23) sobre TODAS as vendas do período e divide pela quantidade de DIAS DISTINTOS
     observados nas vendas recebidas (não pela duração nominal do período) — um período de 30 dias
     em que só 10 tiveram movimento não deve diluir a média por 30, senão o "horário de pico" fica
     artificialmente baixo e menos útil. Sempre retorna as 24 horas, mesmo sem venda em algumas
     (zero, nunca omitida), mesmo critério de `buildHourlyRevenue` (ADR 0042).
   - `summarizeSalesByHour` calcula o KPI de horário de pico médio (a hora com maior
     `averageRevenue`) e a quantidade de dias observados no período, para o card "Dias observados"
     dar contexto de quantos dias entraram na média.

4. **Duas permissões novas, mesmo padrão granular**: `dashboards.channels.view` e
   `dashboards.sales_by_hour.view` (`lib/permissions.ts`), migração
   `20261006090000_dashboards_canais_e_horario` inserindo as duas `Permission` e concedendo a todo
   `CustomRole` com `systemTemplate = true` — mesmo mecanismo da migração `20261005090000_dashboards_de_vendas`
   do ADR 0042. Em modo local, as duas chaves foram adicionadas ao array padrão de `permissionKeys`
   em `lib/local-auth.ts`.

5. **Mesmo catálogo central, mesma tela única.** Os dois dashboards novos entram em
   `lib/dashboards/registry.ts` (mesmo array `DASHBOARDS_REGISTRY` do ADR 0042, não um catálogo
   separado) e em `DASHBOARD_COMPONENTS` de `components/admin/DashboardsWorkspace.tsx` — nenhuma
   peça de navegação/permissão precisou de um mecanismo novo, só mais duas entradas.

6. **Rotas aceitam `?from=&to=`, mesmo contrato dos relatórios com período** (ver
   `/api/admin/reports/payment-methods`): sem `from`/`to`, cai no mês corrente
   (`defaultMonthRange`, `lib/cashflow.ts`) — mesma decisão de fallback já usada pelos relatórios de
   período, para a tela nunca abrir vazia sem nenhum filtro aplicado. `GET
   /api/admin/dashboards/channels` e `GET /api/admin/dashboards/sales-by-hour`, com suporte a modo
   Prisma e modo local (`listLocalSalesForReport`), mesma estrutura das rotas do ADR 0042.

## Consequências

- O módulo Dashboards passa a ter dois padrões de seletor de tempo coexistindo por design: data
  única (Acompanhamento de vendas/multilojas, ADR 0042) e intervalo (Canais/Vendas por Data/Hora,
  este ADR) — cada dashboard novo futuro escolhe o que fizer mais sentido para a pergunta que
  responde, não existe uma regra única "Dashboards sempre é X".
- Se o heatmap dia da semana × hora vier a ser pedido no futuro, a base de dados já está pronta
  (`SaleRecord.completedAt`); a mudança ficaria contida em `lib/dashboards/sales-by-hour.ts` e no
  componente, sem tocar rota/permissão.
