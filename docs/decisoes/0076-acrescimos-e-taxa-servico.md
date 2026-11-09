# Acréscimos operacionais e retirada da taxa de serviço

Pedidos online e internos em Recebido/Em preparo, ainda sem venda e sem saída ou
retirada, aceitam novos produtos e adicionais opcionais do cadastro. O operador
escolhe quantas unidades de uma linha receberão o adicional; se necessário, a linha
é dividida. Preços anteriores são preservados e somente o acréscimo é calculado com
o preço atual. Não permite remover/substituir escolhas já preparadas nem modificar
pedidos iFood. Combos aceitam novo produto, mas não acréscimo parcial de opções.

O endpoint exige sessão com operação de delivery e mesma origem. Uma trava por pedido
serializa acréscimos, pagamento e mudança de etapa. O identificador da solicitação
evita repetir a alteração. Unidade, organização, estado, quantidade, produto, opções
e limites são validados no servidor, e o histórico registra operador e valor acrescido.

Uma nova rodada de cozinha, vinculada ao pedido, contém apenas o complemento. Para
adicionais, o texto identifica o produto e informa explicitamente que não deve ser
refeito. A fila USB usa o identificador dessa rodada, sem reimprimir a rodada original.
Prontidão e encerramento consideram todas as rodadas; cobrança/saída aguardam o
complemento ficar pronto. Comandas internas vinculadas a delivery devem ser cobradas
pela tela do pedido, para manter preço e consumo consistentes.

No pagamento do salão, “Retirar taxa de serviço a pedido do cliente” recalcula o total
sem tratar a retirada como desconto. O servidor usa a taxa cadastrada da unidade e
grava `Sale.serviceWaived` e motivo no evento de fechamento. O comprovante USB indica
a retirada. A interface preserva a taxa real da unidade ao atualizar a comanda e pede
nova conferência das formas de pagamento ao trocar a opção.

Validação PostgreSQL isolada: cheddar em uma de duas unidades, oito novas tentativas
da mesma solicitação, preços e quantidade, limites e opções inválidas, outra unidade,
novo produto; HTTP: sessão/origem, prontidão de todas as rodadas, fechamento com total
atualizado, bloqueio após pagamento e taxa cadastrada de 12% versus retirada sem
permissão de desconto. Dados sintéticos permanecem apenas no banco local de QA.
