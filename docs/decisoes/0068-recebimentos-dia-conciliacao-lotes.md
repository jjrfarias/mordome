# ADR 0068: Recebimentos do dia e conciliação em lote

- Estado: aceito
- Data: 2026-11-06
- Complementa ADRs 0065, 0066 e 0067.

## Decisão

O financeiro oferece uma tela para conferir recebíveis manuais e das vendas de PDV, salão e delivery. O operador filtra dia/conta, inclui atrasados opcionalmente e seleciona até 200 itens da mesma conta. A conferência é manual com o extrato: não há consulta à adquirente nem movimentação bancária. Recebimentos já baixados podem ser conciliados sem criar outra receita. Todos os itens recebem a data efetiva informada, inclusive baixas anteriores; a confirmação informa esse efeito.

O previsto líquido e os snapshots de bruto/taxa permanecem intactos. O total recebido pertence ao lote, sem rateio fictício da diferença entre vendas. Diferença positiva gera receita de ajuste; negativa gera despesa de ajuste. O motivo é obrigatório quando existe diferença. Original mais ajuste corresponde ao valor recebido no saldo. A categoria Ajustes de recebimentos entra normalmente na DRE; os recebíveis de vendas continuam excluídos da duplicação de receita conforme ADR 0066.

ReceiptBatch guarda valor previsto, recebido, diferença, conta, data, motivo e autor. ReceiptBatchItem guarda descrição e valor previstos, situação/data/conta anteriores. Desfazer restaura os itens e anula o ajuste sem apagar o histórico. Vendas canceladas/estornadas depois da conciliação impedem desfazer o lote; o estorno financeiro continua separado. Endpoints individuais de baixa/conciliação recusam itens vinculados a lotes.

## Consistência e segurança

Conforme AI_RULES/03_SECURITY_STANDARDS e 04_ARCHITECTURE_STANDARDS: organização e unidade derivam da sessão, com associação ativa e a permissão existente finance.entries.manage. Não há novas permissões nem integrações externas. Todas as mutações são transacionais e auditadas. Cálculos usam centavos inteiros e persistência Decimal(12,2).

Idempotência usa chave UUID, fingerprint canônico e advisory lock. Versões updatedAt evitam confirmar uma seleção desatualizada; locks seguem Sale → FinancialEntry, compatíveis com cancelamento. A conta recebe lock compartilhado para impedir desativação concorrente. Migrations aditivas incluem constraints de valores, escopo empresa/unidade/conta, referências compostas e ajuste único por lote. Consulta usa snapshot RepeatableRead, limite de 1.000 linhas (totais completos) e 50 lotes no histórico diário.

O dia efetivo usa America/Sao_Paulo; o filtro de baixas delimita meia-noite brasileira atual (UTC-3), enquanto vencimento permanece uma data civil. Esta tela não compensa estornos/despesas: eles são conferidos em Contas a pagar. O saldo geral considera ambas as direções. O modo demonstrativo sem banco não oferece esta operação.

## Validação

`npm run test:receipts:postgres` usa exclusivamente aplicação local e banco com sufixo `_test`. Verifica valores positivos/negativos/exatos, idempotência concorrente e conflito de chave, concorrência entre lotes sobrepostos, rollback integral, rejeição de seleção alterada, contas/unidades inválidas, datas futuras, motivo obrigatório, restauração de conta/data/situação, bloqueio de edição individual, cancelamento real após conciliação, preservação de taxa e auditoria. Os testes de financeiro e recebíveis dos três canais permanecem como regressão.

Navegador valida seleção, motivo obrigatório, confirmação, histórico, desfazimento e responsividade. Publicação segue PR para main, lint/testes/Prisma/build locais e verificação de saúde em produção; nenhuma venda fictícia é inserida no cliente real.
