# ADR 0071 — Entrega, retirada e consumo na loja no pedido online

## Decisão

O checkout permite Entrega, Retirar no local e Consumir na loja. Nome e telefone identificam todos os pedidos. Consumo na loja é identificado pelo nome, sem pedir mesa. O servidor exige endereço apenas na entrega, calcula sua taxa por área cadastrada e remove área/coordenadas de pedidos locais. Retirada e consumo na loja têm taxa zero, sem entregador ou etapa de rota.

DeliveryOrder guarda fulfillment (DELIVERY, PICKUP, DINE_IN). Pedidos antigos e clientes antigos sem modalidade continuam DELIVERY. A chave de idempotência continua protegendo reenvios.

Os três tipos usam a central atual de Delivery, identificada internamente como Pedidos online e delivery. A cozinha e sua impressão mostram modalidade e cliente. Pedidos de consumo local não são anexados automaticamente às comandas manuais do salão: cada pedido online tem número e cobrança próprios na central, evitando associação anônima à conta de terceiros. Não existe cobrança de serviço automática no pedido online.

Retirada/loja passam de RECEIVED para PREPARING e são cobrados/concluídos após cozinha READY, sem courier. Entregas preservam o fluxo de rota atual. Os endpoints de venda conferem estágio e prontidão novamente, com transação serial e idempotência. Rotas/entregadores não são atribuíveis às modalidades locais. Mensagens automáticas de rota/entrega são suprimidas para pedidos locais.

## Validação

Testes de workflow e rótulos; integração PostgreSQL isolada para contrato público, taxa zero, ausência de endereço/coordenadas, compatibilidade de entrega, impressora virtual, prontidão da cozinha, pagamento e replay. Teste visual do checkout e compilação de produção.
