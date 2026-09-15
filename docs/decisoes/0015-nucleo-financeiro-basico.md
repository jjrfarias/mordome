# ADR 0015: Núcleo financeiro básico (categorias, contas, formas de pagamento e lançamentos)

- Estado: aceito
- Data: 2026-09-15

## Contexto

O cliente Betão Hot Dog pediu uma base financeira simples para começar a organizar contas a pagar e a receber fora do PDV (aluguel, fornecedores, contas de consumo, receitas avulsas), além de cadastros de apoio para categorizar e reportar esses lançamentos. Essa fatia é a fundação de telas futuras (fluxo de caixa, acertos, fornecedores, conciliação bancária), que **não** fazem parte deste escopo.

## Decisões

1. **Categoria financeira com tipo fechado.** `FinancialCategory` tem `kind: FinancialCategoryKind` (`INCOME` | `EXPENSE`), escopada por `organizationId` (não por estabelecimento), com `@@unique([organizationId, name, kind])`. Categorias são compartilhadas entre as unidades da mesma organização, como já ocorre com o cardápio (`Category`, `Product`). Decidido nesta fatia: se no futuro for necessário limitar categorias a uma unidade específica, isso pode ser adicionado com um `establishmentId` opcional, sem quebrar o modelo atual.

2. **`PaymentMethodConfig` é um cadastro novo e independente do enum `PaymentMethod` do PDV.** O enum `PaymentMethod` (`PIX`, `CREDIT_CARD`, `DEBIT_CARD`, `CASH`, `OTHER`) usado em `Sale`/`Payment`/`Refund` **continua exatamente como está** nesta fase — ele controla o fluxo operacional de venda. `PaymentMethodConfig` é um cadastro administrativo por estabelecimento (`name`, `kind` como texto livre, `feeRate`, `settlementDays`) para representar variações comerciais como "Cartão Stone Débito" com taxa e prazo de repasse, usado apenas para lançamentos financeiros manuais e relatórios futuros. Integrar os dois conceitos (ex.: vincular cada meio de pagamento de venda a uma configuração financeira) fica para uma fatia futura, quando houver necessidade real de conciliação.

3. **Contas bancárias são escopadas por estabelecimento.** `BankAccount` guarda apenas o essencial (`name`, `bank`, `agency`, `accountNumber`, `initialBalance`). Não há ainda cálculo de saldo corrente — isso pertence à fatia de fluxo de caixa/conciliação bancária, fora deste escopo. O saldo inicial é apenas um dado cadastral por enquanto.

4. **Granularidade do lançamento financeiro.** `FinancialEntry` representa uma conta a pagar ou a receber manual, com `status: FinancialEntryStatus` (`PENDING` | `PAID`), `dueDate` (vencimento) e `paidAt` (preenchido ao marcar como pago, limpo ao reverter para pendente). Não existe distinção de "tipo" (pagar/receber) como campo próprio: o tipo é inferido pela `kind` da categoria vinculada (`INCOME`/`EXPENSE`). Isso evita redundância e possível inconsistência entre o tipo do lançamento e o tipo da categoria escolhida. `bankAccountId` e `paymentMethodId` são opcionais (nem toda conta a pagar já nasce com conta/forma de pagamento definida). O lançamento é sempre escopado por `establishmentId` e também guarda `organizationId` para permitir consultas agregadas por organização sem precisar fazer join a cada consulta, seguindo o padrão já usado em `Sale`, `Recipe`, etc.

5. **Duas permissões novas, independentes.** `finance.manage` controla os cadastros de apoio (categorias, contas bancárias, formas de pagamento). `finance.entries.manage` controla lançar, editar e baixar (marcar como pago/pendente) lançamentos financeiros. São permissões separadas porque, na prática, o dono do negócio pode querer que um gerente lance e baixe contas sem poder alterar a estrutura de categorias/contas/formas de pagamento. Ambas foram adicionadas a `OWNER_PERMISSIONS` em `lib/permissions.ts`, ao catálogo de permissões do modo local (`lib/local-access-control.ts`) e propagadas como `canManageFinance`/`canManageFinanceEntries` em `getCurrentSession` (`lib/auth.ts`) e `getLocalSession` (`lib/local-auth.ts`), com fallback `?? true` no modo local, no mesmo padrão de `canManageStock`/`canManageFloor`.

6. **Sincronização de permissões em bancos já existentes.** Assim como a migração `20260913052000_financial_completion` fez para `stock.adjust`/`discount.apply`/etc., a migração `20260915120000_financeiro_nucleo_basico` insere as duas novas permissões na tabela `Permission` via `INSERT ... ON CONFLICT DO UPDATE` e concede automaticamente a todo `CustomRole` com `systemTemplate = true` (o perfil "Proprietário" de cada organização) via `INSERT ... ON CONFLICT DO NOTHING`. Isso evita a necessidade de reconfigurar manualmente o perfil de proprietário em produção depois do deploy.

7. **Interface única com sub-abas.** Em vez de quatro telas separadas em `SettingsWorkspace`, foi criado um único componente `FinanceManagement` com navegação interna (Categorias / Contas bancárias / Formas de pagamento / Lançamentos), reduzindo a poluição do menu principal de configurações e mantendo a mesma experiência de "um módulo, várias sub-seções" que outras áreas do produto ainda não usam, mas que aqui evita adicionar 4 itens de menu para uma fatia inicial pequena.

## Consequências

- O enum `PaymentMethod` do PDV e o novo `PaymentMethodConfig` coexistem sem relação direta; isso é uma dívida técnica assumida conscientemente e deve ser revisitada quando entrar em escopo a conciliação bancária ou relatórios financeiros que cruzem vendas com formas de pagamento configuradas.
- Não há ainda cálculo de saldo de caixa/banco nem qualquer agregação temporal (fluxo de caixa). O card "lançamentos" apenas soma o total do filtro atual na tela, como atalho de leitura, não como fluxo de caixa.
- Categorias inativas continuam vinculadas a lançamentos existentes (a exclusão não é permitida; apenas inativação), preservando o histórico.
- Se o ambiente de banco não estiver acessível no momento do deploy, a migração `20260915120000_financeiro_nucleo_basico` deve ser aplicada manualmente com `npx prisma migrate deploy` antes de liberar a tela para os usuários; sem isso, as rotas de API em modo servidor retornarão erro ao tentar gravar nas tabelas novas.
