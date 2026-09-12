# ADR 0012 — Status do pedido por item (pendente)

## Status

Registrado como pendência. Não implementado nesta etapa.

## Contexto

A etapa 0011-adjacente introduziu filas de preparo configuráveis (`PreparationStation`): cada produto pode pertencer a uma fila (ex.: Lanches, Bebidas, Sobremesas), cada fila pode ter sua própria tela dedicada e impressora, e a tela de Cozinha filtra os itens de cada pedido por fila.

O status do pedido (`RECEIVED` → `PREPARING` → `READY` → `DELIVERED`), porém, continua sendo do `Order` inteiro, não de cada `OrderItem`. Quando uma mesa envia itens de mais de uma fila num único pedido (ex.: hambúrguer + refrigerante no mesmo envio), a tela de uma fila que marca "pronto" muda o status do pedido inteiro — mesmo que o item de outra fila ainda não tenha sido preparado.

## Consequência atual

Funciona corretamente quando um pedido concentra itens de uma única fila. Fica impreciso quando um mesmo envio mistura itens de filas diferentes: a primeira fila a terminar pode fazer o pedido aparecer como "pronto" ou "entregue" para as demais telas antes da hora.

## Solução futura proposta

Mover o status de preparo para o nível do item (`OrderItem`), com o status do `Order` passando a ser derivado (ex.: pronto somente quando todos os itens estiverem prontos). Isso exige:

- Novo campo de status em `OrderItem` (ou tabela de histórico por item, similar ao `OrderStatusHistory` atual).
- Ajuste na tela de Cozinha para avançar item a item dentro de um pedido, não o pedido inteiro.
- Ajuste na tela de Salão/comanda para refletir o status agregado corretamente.
- Migração de dados e testes de domínio cobrindo pedidos com itens de filas distintas.

## Por que não agora

É uma mudança de modelo de dados maior, que merece discussão própria e não deveria ser encaixada apressadamente dentro da entrega de filas de preparo. Fica registrada aqui para retomar quando fizer sentido priorizar.
