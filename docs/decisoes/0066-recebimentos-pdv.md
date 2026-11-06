# ADR 0066: Recebíveis automáticos do PDV

- Estado: aceito
- Data: 2026-11-06
- Complementa o ADR 0065: pagamentos novos do canal POS passam a integrar o livro financeiro; salão e delivery continuam fora desta automação.

## Configuração e cálculo

Recebimentos do PDV, em Financeiro → Cadastros e conferência, contém uma regra explícita por unidade e método (dinheiro, Pix, débito, crédito à vista). Cada regra define identificação/adquirente, conta de destino, percentual com duas casas decimais, prazo de 0 a 365 dias, contagem corrida/útil e feriados informados pelo operador. Não existem taxas Stone/Ton presumidas. O nome é apenas identificação; não há chamada à API da adquirente nem envio de dados a um terceiro.

O PDV atual não registra parcelas, bandeira ou adquirente por pagamento. Esta etapa cobre crédito à vista e uma regra por método/unidade. Parcelamento, taxas por bandeira, múltiplas adquirentes simultâneas e conciliação automática exigirão evolução explícita do checkout.

Cada Payment de uma nova venda POS gera um FinancialEntry com origem única, bruto, taxa, líquido e snapshot do percentual/prazo/identificação. A taxa é calculada por pagamento em centavos com produto intermediário BigInt e arredondamento half-up no centavo final; não sobre o valor recebido em dinheiro, que pode incluir troco. A data começa no dia da venda em America/Sao_Paulo. Dias úteis pulam sábado, domingo e feriados cadastrados; em D+0 útil, uma data não útil avança até a próxima útil. Dias corridos não fazem esse ajuste.

Dinheiro e Pix de prazo zero são baixados na data da venda. Cartões permanecem PENDING mesmo em D+0: vencimento não comprova crédito bancário. O gestor confirma o repasse no lançamento já gerado, sem recadastrar valores. Taxa e bruto de origem não podem ser alterados na API manual; correções de calendário, conta, notas e baixa permanecem possíveis. Mudanças de regra não recalculam recebíveis existentes.

## Ativação, histórico e pendências

Sale.financeTracked inicia falso na migração e é verdadeiro somente em novas vendas POS. Não se importa histórico automaticamente, pois ele pode estar lançado manualmente ou embutido no saldo inicial. Pagamentos sem regra ativa/conta ativa ficam identificados como pendências na visão geral e configuração, sem impedir a venda nem presumir taxa zero.

Após configurar, a ação Processar pendências usa as regras atuais e a data original da venda, até 100 vendas elegíveis por chamada. É repetível e não recria recebíveis existentes. Vendas legadas nunca são abrangidas. Uma configuração pausada deixa novas vendas aguardando configuração.

## Cancelamentos, reembolsos e DRE

Cancelamento anula recebíveis pendentes por voidedAt, sem apagar registros. Recebimentos já baixados permanecem no livro, bloqueados para edição, com contrapartida única: dinheiro/Pix baixados, cartão pendente de confirmação do desconto. Isso evita reabrir o original após o estorno e modificar o saldo duas vezes. Eventual tarifa residual deve ser conferida com a adquirente.

Reembolsos geram despesa pelo valor efetivamente devolvido ao consumidor, com origem RefundPayment única. Mesmo método usa a conta original; outro método usa sua regra ativa. Em cartão ainda pendente, a previsão do desconto acompanha o vencimento original ou o dia do reembolso, o que for posterior; depois do recebimento, a data prevista é a do reembolso e pode ser ajustada. Dinheiro/Pix são realizados; cartão aguarda confirmação. Não se presume devolução de taxas: um reembolso integral pode deixar apenas a taxa como custo. Eventual devolução de taxa é registrada após conferência.

A DRE já reconhece receita e reembolso pelas vendas. Por isso exclui receitas/estornos automáticos do grupo de outras receitas/despesas e acrescenta somente as taxas dos pagamentos associados às vendas não canceladas do período. O livro de caixa usa líquido e não deve receber uma segunda despesa pela mesma taxa. A DRE permanece gerencial simplificada, com os critérios de CMV e períodos do módulo existente.

## Segurança e consistência

Conforme AI_RULES/03_SECURITY_STANDARDS e 04_ARCHITECTURE_STANDARDS, tenant/unidade vêm da sessão, configuração exige finance.manage e venda exige a permissão operacional existente. A criação financeira participa da transação da venda/reembolso; replay e cancelamento bloqueiam a venda. Origens têm FKs/índices únicos, validação de escopo no banco e constraint bruto − taxa = líquido. Regras não aceitam contas de outras unidades/organizações. Configuração, geração e estornos possuem auditoria. As migrações são aditivas e preservam histórico.

## Evidência reproduzível

- Testes de domínio: cálculo exato, limite monetário, meia unidade de centavo, datas brasileiras, dias corridos/úteis, feriados, virada de ano e regras inválidas.
- `npm run test:pos-finance:postgres` requer TEST_DATABASE_URL local terminando em `_test` e aplicação local (TEST_APP_URL, padrão porta 3022). Cobre venda HTTP real, pagamento dividido/troco, prazo, snapshots, duplicidade/replay concorrente, cancelamento, baixa preservada, reembolso parcial/total, DRE, legado, constraints e autorização/isolamento. Remove somente fixtures próprias.
- Navegador local: gravação de regra, venda, apresentação bruto/taxa/líquido, proteção dos valores, baixa e layouts desktop/celular.

Modo demonstrativo em memória não executa esta integração: a tela informa a necessidade do ambiente com PostgreSQL. Produção e testes de integração usam o mesmo caminho persistente.
