# ADR 0016: Fluxo de caixa

- Estado: aceito
- Data: 2026-09-15

## Contexto

O ADR 0015 (núcleo financeiro básico) entregou categorias, contas bancárias, formas de pagamento e lançamentos financeiros manuais, mas deixou explícito que "não há ainda cálculo de saldo de caixa/banco nem qualquer agregação temporal (fluxo de caixa)". Esta fatia implementa essa agregação: uma tela "Fluxo de caixa" que consolida, por período, tudo que já entra ou sai de caixa no sistema — lançamentos financeiros manuais pagos e vendas do PDV/salão/delivery — sem duplicar dados nem criar uma nova fonte de verdade.

## Decisões

1. **Regime de caixa, não de competência.** O fluxo de caixa usa exclusivamente datas de realização: `FinancialEntry.paidAt` (não `dueDate`) e `Sale.completedAt`/`CashMovement.createdAt`. Um lançamento pendente, mesmo vencido dentro do período, não aparece — porque ainda não movimentou caixa de fato. Isso é a definição central de "fluxo de caixa" (o que efetivamente entrou/saiu), em oposição a "contas a pagar/receber" (o que está previsto), que já é coberto pela tela de Lançamentos.

2. **Três fontes combinadas sem duplicação.**
   - `FinancialEntry` com `status = PAID` e `paidAt` no período: entrada se a categoria vinculada é `INCOME`, saída se `EXPENSE`.
   - `Sale` com `status` em `COMPLETED`/`PARTIALLY_REFUNDED` e `completedAt` no período: entrada usando o valor líquido (`Sale.total` menos a soma de `Refund.amount` da venda), mesmo cálculo já usado pelo "Resumo do dia" (`app/api/operations/summary/route.ts`), para os dois números não divergirem. Uma venda cujo reembolso zera ou ultrapassa o total não gera item de entrada.
   - `CashMovement` do tipo `SUPPLY` (suprimento, entrada) e `WITHDRAWAL` (retirada, saída), no período, para todas as sessões de caixa do estabelecimento (abertas ou fechadas).
   Essas três fontes não se sobrepõem: um lançamento financeiro nunca gera `Sale`/`CashMovement` e vice-versa, então somar os três é seguro e não duplica valores.

3. **Saldo simples, sem reconciliação por conta.** O "saldo acumulado" exibido é `soma(BankAccount.initialBalance) + saldo do período`, sem tentar atribuir cada lançamento a uma conta bancária específica nem reconciliar saldo corrente por conta. Isso é consistente com o ADR 0015, que já trata `initialBalance` como "apenas um dado cadastral por enquanto". Reconciliação bancária de verdade (extrato x lançamentos, por conta) é uma fatia futura fora deste escopo.

4. **Nova permissão `finance.cashflow.view`, separada de `finance.summary.view`.** Cogitou-se reaproveitar `finance.summary.view` (hoje usada pelo "Resumo do dia" do PDV, com dados por auditoria de vendas). Decidiu-se por uma permissão própria porque o fluxo de caixa cruza dados financeiros administrativos (lançamentos, contas bancárias) com vendas, um escopo mais amplo e sensível do que o resumo operacional do dia — um caixa de loja pode precisar ver o resumo do PDV sem ter acesso à visão financeira consolidada da unidade. `finance.cashflow.view` foi adicionada a `OWNER_PERMISSIONS`, ao catálogo local (`lib/local-access-control.ts`) e propagada como `canViewFinanceCashflow` em `getCurrentSession`/`getLocalSession`, com o mesmo padrão de fallback `?? true` no modo local. A migração `20260915130000_fluxo_caixa` insere a permissão e concede a todo `CustomRole` com `systemTemplate = true`, seguindo o padrão do ADR 0015.

5. **Tela como nova sub-aba de `FinanceManagement`, não uma tela separada.** Mantém o padrão já estabelecido no ADR 0015 de "um módulo, várias sub-seções" dentro do menu Financeiro, evitando poluir `SettingsWorkspace` com mais um item de nível superior. A aba "Fluxo de caixa" aparece de forma independente das permissões `finance.manage`/`finance.entries.manage` — um usuário com apenas `finance.cashflow.view` vê só essa aba.

6. **Sem persistência própria.** O fluxo de caixa não tem tabela no banco; é uma agregação calculada a cada requisição (`GET /api/admin/finance/cashflow?from=&to=`) a partir dos dados já existentes. Isso evita duplicar estado e mantém a tela sempre consistente com lançamentos e vendas mais recentes, ao custo de recalcular a cada consulta — aceitável no volume esperado de uma operação de bairro (Betão Hot Dog), sujeito a revisão se o volume de dados justificar cache ou materialização futura.

7. **Modo local com limitação documentada.** Em modo local (`isLocalAuthEnabled()`), não existe uma tabela de vendas separada — o único rastro de vendas concluídas é o log de auditoria em memória (`lib/local-audit.ts`, evento `SALE_COMPLETE`/`SALE_CANCEL`), o mesmo mecanismo já usado por `app/api/operations/summary/route.ts` para o resumo do dia. `computeLocalCashFlow` (em `lib/local-finance.ts`) reaproveita esse padrão, filtrando por período em vez de "hoje". Isso significa que, em modo local, o fluxo de caixa depende de os eventos de auditoria ainda estarem na memória do processo (que é efêmera e reinicia a cada deploy/reinício do servidor de demonstração) — uma limitação aceitável para o ambiente de demonstração local, mas que não existe no modo servidor (Prisma), onde `Sale` é uma tabela persistente. Isso é análogo à limitação já assumida pelo "Resumo do dia" em modo local e não é uma regressão desta fatia.

8. **Nenhuma auditoria própria.** Por ser uma tela somente leitura (sem POST/PATCH), não há necessidade de `AuditEvent` — consultar o fluxo de caixa não é uma mutação.

## Consequências

- A tela não substitui a conciliação bancária nem qualquer acerto por conta bancária individual; isso é comunicado no texto de apoio da própria tela e nesta ADR.
- O total de "entrada" de vendas usa o valor líquido (descontando reembolsos), consistente com o "Resumo do dia" — os dois números não divergem por esse motivo.
- Se o ambiente de banco não estiver acessível no momento do deploy, a migração `20260915130000_fluxo_caixa` deve ser aplicada manualmente com `npx prisma migrate deploy` antes de liberar a tela; sem isso, `finance.cashflow.view` não estará disponível para concessão a perfis personalizados (o modo local não depende da migração).
