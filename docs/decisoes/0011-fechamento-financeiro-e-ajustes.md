# ADR 0011 — Fechamento financeiro e ajustes operacionais

Status: aceito em 12/09/2026.

## Decisão

- Uma venda pode receber vários pagamentos. A soma deve coincidir, em centavos, com o total líquido.
- Troco é permitido somente em dinheiro; ficam registrados valor aplicado, valor recebido e troco.
- Desconto exige motivo e permissão `discount.apply`. Até existir limite percentual por perfil, o limite operacional padrão é 10%; acima dele exige `discount.override`.
- Cancelamento continua restrito ao caixa original aberto. Depois do fechamento usa-se reembolso, total ou parcial, lançado no caixa atual.
- Reembolso exige `sale.refund`, motivo, idempotência e meios cuja soma coincida com o valor. Reposição automática de estoque só ocorre em reembolso total; no parcial, os itens devolvidos devem ser conciliados por ajuste.
- Estoque possui ajustes separados para perda, consumo interno e contagem física. A contagem grava somente a diferença entre saldo sistêmico e saldo contado.
- Todas essas ações geram eventos de auditoria e mantêm isolamento por organização e unidade.

## Consequências

O caixa passa a apresentar valores líquidos por meio de pagamento, descontando reembolsos registrados naquela sessão. O histórico financeiro preserva a venda original e cria lançamentos de reembolso, em vez de reescrever o passado.

## Evolução prevista

Adicionar percentual máximo configurável em cada perfil e seleção granular de itens/quantidades devolvidos para reposição automática em reembolso parcial.
