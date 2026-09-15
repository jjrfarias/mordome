# ADR 0017: Fornecedores

- Estado: aceito
- Data: 2026-09-15

## Contexto

O ADR 0015 (núcleo financeiro básico) já citava "fornecedores" como uma fatia futura fora de escopo. O protótipo de referência do cliente Betão Hot Dog lista "Fornecedores" dentro do menu Financeiro, mas o cadastro é conceitualmente compartilhado: no futuro, Notas de entrada e Ordem de compra (módulo de Estoque) também vão precisar vincular movimentações a um fornecedor. Esta fatia entrega apenas o cadastro básico de fornecedores e o vínculo opcional com `FinancialEntry` — não implementa Ordem de compra, Notas de entrada, Acertos nem Conciliação bancária.

## Decisões

1. **Escopo por organização, não por estabelecimento.** Diferente de `BankAccount`/`PaymentMethodConfig` (escopados por estabelecimento), `Supplier` segue o padrão de `FinancialCategory`: `organizationId` com `@@unique([organizationId, name])`. Justificativa: uma rede como a Betão Hot Dog tipicamente compra do mesmo fornecedor (distribuidor de insumos, fornecedor de embalagens, etc.) em várias lojas da mesma organização, e cadastrar o mesmo fornecedor separadamente em cada unidade geraria duplicação e inconsistência de dados de contato. Isso também mantém o cadastro pronto para ser reaproveitado por Ordem de compra/Notas de entrada no futuro, que tendem a ser negociadas a nível de organização ou repetidas entre lojas. Se no futuro for necessário um fornecedor específico de uma unidade, isso pode ser adicionado com um `establishmentId` opcional, sem quebrar o modelo atual — mesma lógica de extensão futura já usada em `FinancialCategory` (ADR 0015).

2. **Cadastro básico, sem CRM.** Campos: `name` (nome/razão social, obrigatório), `tradeName` (nome fantasia, opcional), `document` (CNPJ/CPF, opcional), `phone`, `email`, `notes` (todos opcionais) e `active`. Não há endereço estruturado, categoria de fornecedor, contatos múltiplos ou qualquer campo de CRM — o objetivo desta fatia é apenas permitir vincular um lançamento financeiro a "quem eu paguei", não substituir uma ferramenta de relacionamento com fornecedores.

3. **Documento validado apenas por tamanho, sem dígito verificador.** `document` é opcional. Quando informado, aceitamos com ou sem máscara (o formulário não impõe máscara) e validamos apenas que, ao remover todos os caracteres não numéricos, restem 11 dígitos (CPF) ou 14 dígitos (CNPJ). Não há validação de dígito verificador nesta fase — decisão deliberada para não bloquear o cadastro por um documento digitado errado quando o dado não é crítico para a operação (é usado apenas como referência, não para emissão fiscal). Sujeito a revisão se o produto passar a exigir emissão de nota fiscal de entrada vinculada ao fornecedor.

4. **Vínculo opcional com `FinancialEntry` via `supplierId`.** `FinancialEntry.supplierId` é uma coluna opcional (`String?`) com relação `onDelete: SetNull` — assim como um fornecedor não pode ser excluído (apenas inativado, ver decisão 5), essa relação garante que, se no futuro alguma rotina de manutenção remover um fornecedor diretamente no banco, os lançamentos vinculados não são apagados nem bloqueados, apenas perdem a referência. Este é o único ponto de integração desta fatia com o fluxo financeiro já existente: a tela "Lançamentos" (sub-aba de `FinanceManagement`) ganha um seletor opcional "Fornecedor" ao lado de categoria/conta bancária/forma de pagamento, populado pelo mesmo `GET /api/admin/finance/entries` que já retorna `categories`/`bankAccounts`/`paymentMethods` (agora também `suppliers`). Ao criar/editar um lançamento, a API valida que o `supplierId` informado pertence à organização do usuário autenticado antes de salvar, rejeitando um fornecedor de outra organização com "Fornecedor inválido." (HTTP 400), no mesmo padrão já usado para `categoryId`/`bankAccountId`/`paymentMethodId`.

5. **Sem exclusão, apenas inativação.** Mesmo padrão de `FinancialCategory`/`BankAccount`/`PaymentMethodConfig`: não existe rota de exclusão de fornecedor, apenas `PATCH` com `active: false`. Isso preserva o histórico de lançamentos já vinculados a um fornecedor mesmo depois que ele deixa de ser usado.

6. **Reaproveita a permissão `finance.manage`, sem criar `suppliers.manage`.** Fornecedores é, nesta fatia, conceitualmente um cadastro de apoio financeiro igual a contas bancárias e formas de pagamento — todos usados para estruturar lançamentos manuais. Criar uma permissão nova (`suppliers.manage`) adicionaria uma granularidade que ninguém pediu e complicaria a interface de perfis sem benefício claro agora. Se no futuro Estoque (Ordem de compra/Notas de entrada) precisar que um usuário gerencie fornecedores sem ter acesso aos demais cadastros financeiros, essa permissão pode ser desmembrada então — decisão registrada como "sujeita a revisão quando Estoque passar a depender deste cadastro".

7. **Nova sub-aba "Fornecedores" dentro de `FinanceManagement`.** Segue o padrão já estabelecido pelo ADR 0015 (um módulo, várias sub-seções) e pelo ADR 0016 (mais uma sub-aba sem virar tela de nível superior). A aba aparece apenas para quem tem `finance.manage`, mesmo gate das abas "Categorias"/"Contas bancárias"/"Formas de pagamento".

8. **Modo local segue o adaptador em memória de `lib/local-finance.ts`.** `listLocalSuppliers`/`createLocalSupplier`/`updateLocalSupplier` foram adicionados nesse arquivo, escopados por `organizationId`, no mesmo estilo das funções já existentes para `BankAccount`. `createLocalFinancialEntry`/`updateLocalFinancialEntry` e o tipo `LocalFinancialEntry` foram atualizados para aceitar `supplierId` opcional.

9. **Migração manual.** Como nas fatias anteriores, o ambiente de banco não estava acessível no momento desta implementação; a migração `20260915140000_fornecedores` foi escrita manualmente seguindo o padrão de `20260915120000_financeiro_nucleo_basico`/`20260915130000_fluxo_caixa` e deve ser aplicada com `npx prisma migrate deploy` antes de liberar a tela em produção. Sem essa migração aplicada, a tabela `Supplier` e a coluna `FinancialEntry.supplierId` não existem no banco e as rotas de API em modo servidor falharão ao tentar gravá-las.

## Consequências

- O cadastro de fornecedores fica pronto para ser reaproveitado por Ordem de compra e Notas de entrada (Estoque) numa fatia futura, sem necessidade de migração adicional além de novas tabelas que referenciem `Supplier.id`.
- Como o documento não é validado por dígito verificador, é possível cadastrar um CPF/CNPJ com dígitos verificadores inválidos mas de tamanho correto; isso é uma limitação aceita nesta fase.
- Fornecedores inativos continuam vinculados a lançamentos existentes (a exclusão não é permitida; apenas inativação), preservando o histórico, mesmo padrão do restante do módulo financeiro.
