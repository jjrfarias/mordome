# ADR 0010 — Cancelamentos operacionais

## Status

Aceito e implementado na primeira fatia.

## Contexto

Itens podem ser desistidos depois do envio à cozinha e vendas podem ser lançadas por engano. Apagar registros ou editar totais históricos impediria reconstruir quem fez cada ação e poderia duplicar estornos de estoque.

## Decisão

- Item ainda não enviado continua podendo ser reduzido ou removido pelo fluxo normal da comanda.
- Item enviado exige `tabs.cancel_item`, quantidade inteira positiva e motivo obrigatório.
- Cada cancelamento gera um `OrderItemCancellation` imutável ligado ao item da rodada original.
- A quantidade cancelada é retirada da comanda e aparece riscada na cozinha. Se todos os itens de uma rodada forem cancelados, o pedido muda para `CANCELLED`.
- Venda concluída exige `pos.cancel_sale`, motivo e caixa original ainda aberto.
- Cancelar a venda muda seu status, exclui seus pagamentos do esperado do caixa e cria movimentos `REVERSAL` para os consumos automáticos.
- Venda, itens e pagamentos originais não são apagados.
- Se o caixa original já foi fechado, a venda não pode ser cancelada. Será necessário um futuro fluxo de reembolso que registre nova movimentação financeira.
- Transações seriais e mudança condicional de status impedem estorno duplicado em concorrência.

## Auditoria

Cancelamento de item usa `TAB_ITEM_CANCEL`; cancelamento de venda usa `SALE_CANCEL`. Ambos registram ator, unidade, motivo, antes e depois. Senhas ou dados de pagamento sensíveis não entram nos snapshots.

## Consequências

Cancelamento e reembolso são conceitos diferentes. Relatórios e caixa consideram somente vendas `COMPLETED`, enquanto o histórico preserva as canceladas. O modelo de cancelamento por rodada permite informar corretamente a cozinha mesmo quando o mesmo produto foi enviado mais de uma vez.
