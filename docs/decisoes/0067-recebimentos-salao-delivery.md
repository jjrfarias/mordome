# ADR 0067: Recebimentos de vendas em todos os canais

- Estado: aceito
- Data: 2026-11-06
- Amplia o ADR 0066 para POS, FLOOR e DELIVERY.

## Decisão

Toda nova venda concluída pelo endpoint operacional passa a gerar recebíveis na mesma transação. Abrir comanda, enviar itens à cozinha, criar pedido ou mudar o estágio da entrega não gera recebimento: o gatilho é a conclusão do pagamento. A taxa incide sobre cada pagamento, cujo total já contempla serviço do salão, entrega e descontos calculados no servidor.

As regras existentes por unidade e forma de pagamento são compartilhadas pelos três canais. Não há nova configuração a duplicar nem migração de schema. A identificação e a categoria dos novos lançamentos distinguem PDV, Salão e Delivery; reembolsos e estornos mantêm essa origem. Recebíveis existentes conservam seus snapshots, nomes e valores.

Visão geral, contagem e processamento de pendências abrangem todos os canais com financeTracked=true. Vendas anteriores de salão/delivery permanecem false e não são importadas, evitando duplicidade com histórico manual/saldo inicial. O título da configuração passa a Recebimentos de vendas; nomes internos de tabela/API permanecem por compatibilidade.

Os critérios anteriores de dinheiro/Pix, confirmação do repasse dos cartões, dias úteis/feriados, idempotência, cancelamento, reembolso e DRE continuam válidos. As regras representam taxas da forma de pagamento; comissões específicas de marketplaces e parcelamento não são introduzidos nesta mudança.

## Validação

O teste PostgreSQL existente foi ampliado para fechar uma comanda com serviço e concluir um pedido com entrega pela API real. Verifica bruto/taxa/líquido, data de repasse, rótulo/categoria, pré-condições operacionais, duas conclusões simultâneas gerando uma só venda, cancelamento de delivery, reembolso de salão, pendências de Pix dos dois canais e exclusão do legado. Mantém cobertura de isolamento e permissões. Navegador verifica origem dos lançamentos, valores, instruções compartilhadas e layout desktop/celular.

Conforme AI_RULES/03_SECURITY_STANDARDS e 04_ARCHITECTURE_STANDARDS, não se alteram permissões: tenant/unidade vêm da sessão, o cálculo permanece no servidor e os recebíveis participam da transação/auditoria da venda. Nenhum dado é enviado a uma nova API externa.
