# Comandas por nome dentro da mesa

## Regra

Uma mesa pode ter várias comandas abertas, cada uma identificada pelo nome da pessoa
ou do grupo. Ao abrir a mesa, o seletor **Comanda de quem?** indica a conta em uso.
**Nova comanda** cria outra conta; **Alterar nome** identifica também uma comanda
preexistente. A conta sem nome continua aparecendo como **Comanda da mesa**.

Os produtos adicionados, quantidades, cancelamentos, rodadas da cozinha e pagamento
pertencem somente à comanda selecionada. **Pagar esta comanda** fecha uma única conta.
A mesa fica livre somente quando não restar comanda aberta. Contas vazias podem ser
encerradas sem gerar venda. Não há transferência ou divisão de itens já lançados nesta
entrega, conforme o escopo escolhido pelo responsável.

O nome aparece no cabeçalho da comanda, no pagamento, na cozinha, nos tíquetes
Bluetooth/navegador, no recibo e nas vendas recentes/reimpressão. A taxa de serviço e
os recebíveis continuam seguindo o fluxo de venda existente por comanda. Não se
altera quantidade nem preço para separar contas, e não se reenvia o histórico à cozinha.

## Persistência e autorização

`Tab.name` tem padrão vazio, preservando todas as comandas existentes. O índice
parcial de uma comanda aberta por mesa é substituído por um índice único por mesa
e nome normalizado com `lower(btrim(name))`, só para mesas físicas abertas. Nomes
iguais (inclusive diferença de maiúsculas) não podem coexistir na mesma mesa, mas
podem ser reutilizados após o pagamento. Balcão e delivery mantêm seu funcionamento.

As APIs usam `floor.operate`, sessão, unidade e associação ativa. ADD_ITEM recebe
`tabId`; com várias contas abertas, clientes antigos sem `tabId` recebem conflito e
instrução para selecionar uma conta. IDs de outra unidade, mesa ou conta já paga são
rejeitados. Criação, alteração do nome e encerramento vazio têm auditoria. Transações
Serializable e o índice único protegem contra criação ou alteração concorrente.

A leitura retorna `tabs` abertas, mantém `tab` como primeira conta para compatibilidade
e inclui na cozinha somente as rodadas de comandas abertas. Pagar uma pessoa encerra
suas rodadas de cozinha e preserva as das outras pessoas.

## Validação

- Migração aplicada em PostgreSQL local isolado.
- `scripts/check-named-tabs-postgres.ts`: duas contas na mesma mesa, isolamento entre
  unidades, ID de outra mesa/conta paga, nome vazio/duplicado, concorrência, permissões,
  pagamento e repetição idempotente, mesa livre só após última conta, encerramento do
  preparo pelo pagamento e nova rodada contendo apenas o acréscimo.
- `tests/named-tabs.test.ts`: modo local, pagamento independente e nome da cozinha.
- Interface desktop/celular e verificação de build, lint, testes e tipos.

Para testar: configurar TEST_DATABASE_URL com banco local terminado em `_test`,
TEST_APP_URL local e executar `npx tsx scripts/check-named-tabs-postgres.ts`. Não
executar o cenário em dados de operação. KEEP_TEST_FIXTURES=true é opcional, somente
no banco isolado, para manter a conta fictícia de revisão visual.

## Encerramento da cozinha pelo pagamento (2026-11-07)

Pagar uma comanda de mesa conclui suas rodadas RECEIVED, PREPARING e READY como DELIVERED na mesma transação da venda, com histórico e auditoria do operador. Rodadas já entregues/canceladas são preservadas. Não depende de a equipe ter avançado o preparo. Reenvio idempotente não duplica os registros, falha de pagamento não encerra pedidos e outras comandas da mesma mesa continuam na fila.

A fila de mesas considera somente comandas abertas, inclusive para ocultar pendências antigas de contas já pagas. PDV e pedidos online/delivery preservam seus fluxos próprios. Esta regra substitui a continuidade de preparo após pagamento descrita na versão inicial.
