# ADR 0042: Dashboards de vendas (Acompanhamento de vendas + multilojas)

- Estado: aceito
- Data: 2026-09-16

## Contexto

O dono pediu um módulo "Dashboards", distinto do módulo "Relatórios" (ADR 0033+): enquanto
Relatórios é uma tela tabular com ordenação e exportação Excel/PDF, feita para análise/auditoria de
um PERÍODO, Dashboards é uma tela visual com gráficos de verdade, feita para acompanhamento rápido
de UM DIA — como uma versão mais rica da tela "Resumo do dia" (`app/page.tsx`, componente
`Summary`), que já mostrava alguns números do dia mas sem nenhum gráfico. Esta fatia entrega dois
dashboards: "Acompanhamento de vendas" (unidade ativa da sessão) e "Acompanhamento de vendas
multilojas" (consolidado das unidades da rede Betão — Parque Aeroporto, Anexo, Cavaleiros,
Lagomar — ou de qualquer organização com mais de uma unidade).

## Decisões

1. **Dashboards não é Relatórios.** Dois módulos de primeiro nível na sidebar, cada um com seu
   próprio catálogo (`lib/reports/registry.ts` vs. `lib/dashboards/registry.ts`), sua própria tela
   (`ReportsWorkspace.tsx` vs. `DashboardsWorkspace.tsx`) e seu próprio prefixo de permissão
   (`reports.<slug>.view` vs. `dashboards.<slug>.view`). Dashboards nunca ganha tabela genérica
   ordenável nem exportação — cada dashboard é um componente próprio que busca seus dados e desenha
   seus próprios gráficos com `recharts`. Relatórios nunca ganha um "modo gráfico" nesta fatia —
   ficam deliberadamente separados: um é para "o que aconteceu no período, para auditar/exportar", o
   outro é para "como está indo hoje, de relance".

2. **Dashboard sempre olha para UM dia, nunca um intervalo.** Diferente do `PeriodFilter`
   (De/Até + atalhos Hoje/Esta semana/Este mês) usado pelos relatórios, os dois dashboards desta
   fatia usam um único seletor de data (`<input type="date">` + atalhos Hoje/Ontem) — não existe
   "Dashboards por semana" aqui. Ambas as rotas de API aceitam `?date=YYYY-MM-DD` (hoje por padrão),
   resolvendo o dia completo em hora local do servidor (00:00:00.000 a 23:59:59.999), mesma
   simplicidade de fuso horário já aceita pelo agrupamento por dia do Faturamento por dia (ADR 0033,
   decisão 9).

3. **`recharts` para os gráficos.** Biblioteca madura e amplamente usada em projetos React, sem
   exigir configuração complexa (SVG puro, sem canvas, sem dependência de CSS externo) — instalada
   com `npm install recharts`. Único critério decisivo frente a alternativas mais pesadas
   (`visx`, `chart.js` com wrapper React) ou mais baixo nível (D3 puro): API declarativa
   (`<BarChart>`, `<PieChart>`, `<ResponsiveContainer>`) que já resolve responsividade e tooltip sem
   código adicional. As cores dos gráficos não usam a paleta padrão do recharts: reaproveitam os
   tokens de `app/globals.css` (`--green: #173f35`, `--orange: #e97c4b`, `--green-2: #245e4d`, mais
   um tom de dourado para o quarto canal), para os gráficos combinarem visualmente com o resto do
   sistema.

4. **Cálculo puro extraído para `lib/dashboards/sales-tracking.ts`**, sem import de Prisma/Next,
   testável com `node --test` como todo o resto do sistema:
   - `buildHourlyRevenue(sales)`: agrega faturamento líquido por hora (0-23) a partir de
     `completedAt`. Sempre retorna as 24 posições, mesmo sem venda em algumas (zero, nunca
     omitida) — é o que permite o gráfico de barras mostrar o dia inteiro e o dono enxergar de
     relance os horários "vazios" tanto quanto os de pico.
   - `buildChannelRevenue(sales)`: agrega faturamento líquido por canal (POS/FLOOR/DELIVERY/ONLINE).
     Diferente da agregação por hora, aqui só entram canais com pelo menos uma venda no dia — um
     gráfico de composição (pizza) com uma fatia de valor zero não agrega informação.
   - `buildSalesTrackingKpis(sales)`: faturamento, quantidade de vendas e ticket médio do dia —
     mesmos três números já calculados por `/api/operations/summary` (resumo do dia), mas o
     dashboard não importa nem duplica aquela rota: cada dashboard consulta as vendas do dia
     diretamente (Prisma ou `listLocalSalesForReport`) e chama esta função pura, evitando tanto
     duplicar a lógica quanto criar uma dependência entre os dois módulos.
   - `buildStoreRevenue(stores)`/`summarizeMultiStore(storeRevenues)`: agregam faturamento por
     unidade e o total consolidado. `buildStoreRevenue` recebe a lista de unidades JÁ FILTRADA pela
     sessão (nunca decide sozinha quais unidades entram) e SEMPRE retorna uma posição por unidade
     recebida, mesmo com zero vendas no dia — decisão explícita do escopo: uma unidade sem vendas é
     uma informação relevante por si só, não deve sumir do comparativo.

5. **Multilojas usa exatamente `session.establishments`, nunca consulta `Establishment`/organização
   por conta própria.** A rota `GET /api/admin/dashboards/multi-store-tracking` itera sobre
   `session.establishments` (modo Prisma: já filtrado por `EstablishmentAccess` dentro de
   `getCurrentSession`; modo local: já filtrado pelo `allowedIds` do usuário local dentro de
   `getLocalSession`) — o mesmo array que já alimenta o seletor de unidade ativa em `app/page.tsx`.
   Um usuário com acesso a menos de todas as unidades da organização nunca vê as demais no
   dashboard multilojas: não é um recorte adicional, é consequência direta de reaproveitar a lista
   que a sessão já expõe. Em modo local, isso equivale às 4 unidades fixas do Betão
   (`parque-aeroporto`/`anexo`/`cavaleiros`/`lagomar`, `lib/local-auth.ts`) — cada uma tem seu
   próprio log de auditoria isolado por `establishmentId`, agregado via `listLocalSalesForReport`
   (mesma função já usada por todos os relatórios locais, sem nenhuma variante nova).

6. **Duas permissões novas, mesmo padrão granular dos relatórios**:
   `dashboards.sales_tracking.view` e `dashboards.multi_store_tracking.view`
   (`lib/permissions.ts`), migração `20261005090000_dashboards_de_vendas` inserindo as duas
   `Permission` e concedendo a todo `CustomRole` com `systemTemplate = true` (mesmo padrão das
   migrações 0015/0016/0018/0033+). Em modo local, as mesmas chaves foram adicionadas ao array
   padrão de `permissionKeys` em `lib/local-auth.ts`.

7. **Fora de escopo desta fatia (decisão explícita):**
   - "Canais" e "Vendas por Data/Hora" NÃO viram dashboards separados — o gráfico de canal e a
     granularidade por hora já ficam cobertos dentro do dashboard "Acompanhamento de vendas". Um
     dashboard a mais para cada eixo de corte seria fragmentação sem ganho: o dono quer ver os dois
     de relance na mesma tela, não trocar de tela para cada recorte.
   - "Desempenho por atendente/garçom" continua sendo só relatório (ADR 0034) — não vira dashboard
     nesta fatia nem em nenhuma futura sem pedido explícito.
   - Sem seletor de intervalo (semana/mês) nos dashboards — se o produto precisar de tendência ao
     longo de vários dias, isso é uma revisão futura (provavelmente um terceiro dashboard, não uma
     mudança nestes dois).

## Consequências

- Adicionar um dashboard novo no futuro segue o mesmo mecanismo do framework de relatórios: uma
  permissão em `lib/permissions.ts`, uma entrada em `lib/dashboards/registry.ts`, uma rota, um
  componente com seus próprios gráficos — nenhuma outra peça (navegação, catálogo) muda.
- `recharts` é a primeira biblioteca de gráficos do projeto — qualquer gráfico futuro (em
  Relatórios ou em outro módulo) deveria reaproveitá-la em vez de introduzir uma segunda biblioteca,
  salvo necessidade técnica explícita.
- O dashboard multilojas não precisou de nenhuma mudança em `lib/auth.ts`/`lib/local-auth.ts` além
  das duas novas permissões — reaproveitou 100% do mecanismo de acesso por unidade já existente.
