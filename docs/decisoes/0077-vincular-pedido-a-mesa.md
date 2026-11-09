# Vincular pedido online à mesa e explicar bloqueio da cobrança

O Salão oferece “Vincular pedido à mesa” a quem pode operar o salão. O operador
seleciona um pedido interno/online aberto e uma mesa disponível para seu perfil.
Pedidos pagos, cancelados, despachados ou do iFood não podem ser vinculados.

A transação move a comanda interna existente para a mesa física, identifica-a pelo
cliente e sufixo do pedido e mantém todos os tíquetes originais e complementos.
Não cria uma segunda conta nem reenvia produção. Mesmo em mesa ocupada, as contas
permanecem separadas. Repetir o vínculo à mesma mesa devolve a mesma comanda.
Retira taxa de entrega, entregador e endereço de entrega; o histórico guarda a mudança.

DeliveryOrderItem continua sendo a fonte financeira desses pedidos. TabItem mantém
o histórico de produção, inclusive linhas de acréscimo de cheddar sem refazer pastel.
O Salão apresenta os itens financeiros completos e usa o mesmo endpoint de acréscimos,
agora autorizado também ao garçom responsável pela mesa. Novos produtos usam a oferta
do salão; preços anteriores são preservados. Mutação comum de TabItem é bloqueada
nessas comandas para não divergir da conta original. Remoção de itens vinculados e
transferência inversa para delivery não fazem parte desta entrega.

Pagamento passa exclusivamente pelo Salão, usa itens completos, serviço configurado
e sua opção de retirada. Conclui pedido, comanda e rodadas atomicamente. Estoque não
trata a linha de cheddar da cozinha como outro pastel. A tela de delivery deixa de
listar pedidos já vinculados. Acréscimos, vínculo e pagamento compartilham a trava
por pedido. O tíquete de novos complementos identifica a mesa; papel já impresso
não é reimpresso automaticamente.

“Cobrar e concluir” no delivery agora abre a janela mesmo enquanto a cozinha está
pendente. A janela explica a pendência e atualiza a prontidão pelo polling existente.
A conclusão continua bloqueada até pedido e complementos ficarem prontos.

Validação: 351 testes unitários, lint, compilação, teste PostgreSQL/HTTP com cheddar,
mesa ocupada, repetição de vínculo, isolamento, autenticação/origem, cobrança nos
dois canais, fechamento único, serviço e preservação dos tíquetes. Interface validada
em 390px com pedido fictício. O vínculo automático pelo cliente no link geral e a
comanda compartilhada por código continuam fora desta entrega.
