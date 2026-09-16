# ADR 0033: Framework de relatórios + Vendas por período + Faturamento por dia

- Estado: aceito
- Data: 2026-09-16

## Contexto

O dono quer um módulo de Relatórios "flexível, customizável", com uma única tela para escolher qual
relatório ver, e permissão configurável por relatório individualmente — um perfil pode ter acesso a
um relatório específico sem ter acesso a outro (confirmado explicitamente). `docs/FUNCOES.md` já
citava um "protótipo parcial" de relatórios sem implementação real. Esta fatia entrega a
infraestrutura comum que todo relatório futuro vai reaproveitar, e dois relatórios iniciais
construídos sobre ela: Vendas por período e Faturamento por dia. Outros 9 relatórios do menu
original (cupons, desempenho por atendente/garçom, DRE, itens vendidos, tempo de produção, vendas
por área de entrega/forma de pagamento) ficam fora de escopo — virão em fatias futuras reaproveitando
esta base.

## Decisões

1. **Permissão granular por relatório, não por módulo.** Cada relatório do catálogo tem sua própria
   chave `reports.<slug>.view` (`REPORTS_SALES_BY_PERIOD_VIEW = "reports.sales_by_period.view"`,
   `REPORTS_REVENUE_BY_DAY_VIEW = "reports.revenue_by_day.view"`, em `lib/permissions.ts`), em vez de
   uma permissão única "ver relatórios". Isso é a peça central pedida pelo dono do produto. A sessão
   não ganhou nenhuma flag booleana nova (`canView<Relatorio>`): a tela e as rotas de API consultam
   diretamente o array `session.permissionKeys`, que já existe e já é propagado por
   `getCurrentSession`/`getLocalSession`. Ver `docs/AUTORIZACAO.md` para o detalhamento do padrão.

2. **Catálogo central de relatórios (`lib/reports/registry.ts`).** Uma lista simples de
   `{ id, label, description, permissionKey, category }`. `listAvailableReports(permissionKeys)`
   filtra pelo que a sessão pode ver. Adicionar um relatório novo no futuro exige: criar a permissão
   em `lib/permissions.ts`, registrar aqui, implementar a rota `GET /api/admin/reports/<id>` e o
   componente de conteúdo, e referenciá-lo no mapa `REPORT_COMPONENTS` de
   `components/admin/ReportsWorkspace.tsx` — nenhuma outra peça do framework muda.

3. **Uma única tela "Relatórios"** (`components/admin/ReportsWorkspace.tsx`), item de primeiro nível
   na sidebar (`app/page.tsx`, ao lado de "Resumo"/"Histórico"), visível se a sessão tem qualquer
   permissão `reports.*.view`. A navegação lateral lista só os relatórios liberados; sem nenhum,
   mostra um estado vazio claro em vez de quebrar. Cada relatório é um componente próprio
   (`SalesByPeriodReport`, `RevenueByDayReport`) que busca seus dados e monta suas colunas — a
   tela-mãe só orquestra a seleção.

4. **Tabela de relatório genérica com ordenação client-side**
   (`components/admin/reports/ReportTable.tsx`): recebe `columns`/`rows`/`footer`, ordena por clique
   no cabeçalho (assc/desc/nenhum), formata cada célula via `column.format` (reaproveitando `money()`
   de `lib/domain.ts` para valores monetários) e já embute os dois botões de exportação — nenhum
   relatório implementa exportação própria.

5. **Filtro de período extraído para `components/admin/PeriodFilter.tsx`.** O padrão De/Até +
   atalhos Hoje/Esta semana/Este mês estava duplicado três vezes dentro de
   `components/admin/FinanceManagement.tsx` (Acertos, Conciliação bancária, Fluxo de caixa), cada
   cópia com sua própria `applyShortcut`/`toDateInput`/`startOfWeek`/`startOfMonth`. Esta fatia
   extraiu um único componente reutilizável e refatorou as três abas do Financeiro para usá-lo, sem
   mudar comportamento (mantido `startOfWeek` com domingo como início da semana, igual ao código
   original). Os dois relatórios novos usam o mesmo componente.

6. **Exportação Excel/PDF genérica e roda inteiramente no navegador** (`lib/reports/export.ts`),
   sem serviço externo:
   - **Excel**: `exceljs` (`npm install exceljs`) — gera `.xlsx` real (não CSV disfarçado), com
     título, cabeçalho estilizado e largura de coluna automática. Biblioteca madura, isomórfica
     (roda em Node e no browser via `workbook.xlsx.writeBuffer()`), testável diretamente com
     `node --test` sem precisar de DOM — foi o critério decisivo frente a alternativas mais pesadas
     ou dependentes de serviço.
   - **PDF**: `jspdf` + `jspdf-autotable` (`npm install jspdf jspdf-autotable`) — geração de PDF e
     tabela no cliente. Import correto é a exportação nomeada `{ jsPDF }` (não o `default`, que não é
     o construtor nessa versão). Também roda em Node sem DOM, o que permitiu testar
     `buildPdfBuffer` com `node --test` como qualquer outra função pura.
   - As funções "build" (`buildExcelBuffer`/`buildPdfBuffer`) retornam `ArrayBuffer` e não tocam
     `window`/`document`, então são testáveis isoladamente. Só `downloadReportAsExcel`/
     `downloadReportAsPdf` (que criam o `Blob`/link de download) exigem navegador.

7. **Cálculo dos relatórios é puro e compartilhado entre modo Prisma e modo local**
   (`lib/reports/sales.ts`, sem import de Prisma/Next). Recebe uma lista normalizada `SaleRecord[]`
   (`id, completedAt, channel, table, payment, subtotal, discount, total, refunded`) — a mesma forma
   sai de uma consulta Prisma (`app/api/admin/reports/*/route.ts`) ou do log de auditoria local
   (`listLocalSalesForReport` em `lib/local-finance.ts`, seguindo o mesmo padrão de
   `computeLocalCashFlow` — não existe um "banco" de vendas locais separado). "Vendas concluídas no
   período" = status `COMPLETED`/`PARTIALLY_REFUNDED`, excluindo canceladas e totalmente
   reembolsadas (`refunded >= total`).

8. **Vendas por período**: uma linha por venda, com valor bruto = `subtotal` (antes do desconto),
   desconto = `discount`, valor líquido = `total - refunded` (já descontando reembolso parcial).
   Resumo: quantidade de vendas, valor bruto total, desconto total, valor líquido total e ticket
   médio (líquido / quantidade).

9. **Faturamento por dia**: agrega os mesmos `SaleRecord` por `completedAt.slice(0, 10)` (data
   local ISO, sem fuso — mesma simplificação usada em outros relatórios de período do sistema),
   uma linha por dia em ordem cronológica, com total geral no rodapé.

10. **Migração `20260926090000_framework_de_relatorios`** segue o padrão das migrações 0015/0016/
    0018: insere as duas permissões na tabela `Permission` e concede a todo `CustomRole` com
    `systemTemplate = true`. Em modo local, as mesmas chaves foram adicionadas ao array padrão de
    `permissionKeys` em `lib/local-auth.ts` (o `role-owner` local já herda de `OWNER_PERMISSIONS`,
    então nada mais precisou mudar em `lib/local-access-control.ts`).

## Consequências

- Adicionar um relatório novo no futuro é essencialmente: uma permissão, uma entrada no registro,
  uma rota, um componente — a navegação, a permissão granular, a tabela e a exportação já existem.
- `FinanceManagement.tsx` ficou mais enxuto (uma duplicação a menos) e qualquer tela futura com
  filtro de período usa `PeriodFilter` em vez de reimplementar.
- Nenhuma dependência de serviço externo foi introduzida — Excel e PDF são gerados no navegador do
  próprio usuário.
- Decidido nesta fatia, sujeito a revisão: "dia" para o agrupamento de Faturamento por dia usa o
  prefixo `YYYY-MM-DD` do `completedAt` (ISO), sem conversão explícita de fuso horário — mesma
  simplificação já aceita em outras partes do sistema. Se o produto precisar de fuso horário
  configurável por estabelecimento, isso é uma revisão futura, não desta fatia.
