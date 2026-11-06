# ADR 0065: Financeiro baseado em lançamentos e saldos datados

- Estado: aceito
- Data: 2026-11-06

## Problema e decisão

O fluxo anterior somava vendas, lançamentos e movimentos de caixa, podendo duplicar receitas e confundir faturamento com dinheiro disponível. O saldo inicial não tinha data e o histórico anterior ao período podia ser perdido.

A primeira etapa oferece acesso Financeiro no menu, visão geral, contas a pagar/receber e previsão de 7, 15, 30, 60 ou 90 dias. A fonte é exclusivamente FinancialEntry e BankAccount. Valores são calculados em centavos inteiros, com entrada decimal validada sem arredondamento silencioso. A interface distingue saldo registrado, realizado e previsto; não denomina o saldo como lucro ou saldo consultado no banco.

## Regras

- O saldo inicial representa o início da data informada. Baixas desde essa data, inclusive, compõem o saldo atual. Contas inativas mantêm seu saldo histórico.
- Contas existentes recebem balanceAsOf nulo: o operador informa saldo e data juntos. Não se inventa uma data nem se altera o saldo existente na migração.
- Saldo sem referência, baixa sem conta/data ou com data futura deixa o saldo total como “A conferir”. Entradas e saídas previstas continuam visíveis.
- Baixa exige conta da unidade e data efetiva, nunca futura. A data civil usa America/Sao_Paulo. A baixa retira o compromisso da previsão e entra uma única vez no realizado. Reabrir desfaz esse efeito.
- Despesas vencidas entram no primeiro dia da previsão. Recebíveis vencidos ficam separados, fora da projeção, até reagendamento. Não se estima venda futura.
- A visão consolidada inclui pendências sem conta; o filtro por conta as exclui e informa essa regra.
- Vendas, taxas, acertos e suprimentos/sangrias não entram automaticamente. O usuário registra o recebimento líquido uma vez. Transferências internas não são receita/despesa e sua automação fica para etapa posterior.
- O endpoint legado de fluxo realizado também usa o livro financeiro; o saldo histórico ignora baixas posteriores ao corte.

## Integridade e autorização

Permissões existentes permanecem no servidor. Referências de conta e forma de pagamento são da unidade; categoria e fornecedor são da organização. Baixas, reaberturas, conciliação e alterações de saldo são auditadas em transação. Bloqueios de linha serializam edição/baixa e conciliação. Lançamentos conciliados não podem ser editados sem desfazer a conciliação.

Criações da interface têm chave de idempotência UUID, unicidade no banco e bloqueio transacional: repetição idêntica retorna a conta criada; reuso com dados diferentes falha. Categorias com lançamentos não podem trocar receita por despesa, inclusive por proteção no banco.

A migração 20261106170000_finance_opening_date adiciona duas colunas opcionais, índice único e gatilho; não remove dados nem reclassifica histórico.

## Verificação

Testes unitários cobrem centavos, datas, saldo histórico, abertura no dia, vencidos e previsto/realizado. O script `npm run test:finance:postgres` exige TEST_DATABASE_URL local terminado em `_test` e TEST_APP_URL local (padrão http://127.0.0.1:3022). Cria e remove fixtures próprias, testa concorrência/idempotência, baixa/reabertura, conciliação, auditoria, permissões e isolamento de organizações/unidades.

Conferência de navegador local cobre visão geral, filtro de conta, cadastro/baixa, situação, detalhe diário e layout desktop/celular. O build é validado separadamente. Esta etapa não valida integração bancária ou conciliação automática de adquirentes.
