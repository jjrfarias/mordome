# Comprovante de venda pela impressora local

O agente de cozinha também imprime comprovantes não fiscais de vendas concluídas
(salão, PDV e delivery), independentemente do dispositivo que fechou a conta.
Usa os itens, totais e pagamentos persistidos na venda, incluindo desconto, serviço,
entrega, valor recebido e troco. Cabeçalho e rodapé são centralizados; CNPJ aparece
quando o documento cadastrado da unidade tem 14 dígitos. Não simula autorização
fiscal, chave ou QR code.

A ativação é por agente, pelo script `scripts/enable-sale-receipts.mjs` executado no
servidor com o hash de seu token. `receiptsActivatedAt` começa nulo; a ativação registra
o instante e não retroage ao ser repetida. Somente vendas concluídas desde esse instante
entram na fila. Agentes e lojas sem ativação permanecem com o comportamento anterior.

A fila existente aceita uma origem por trabalho: pedido de cozinha ou venda.
Índice único por agente/venda e inserção com conflito ignorado evitam duplicação,
inclusive em consultas concorrentes. A reserva verifica o estado da venda; cancelamento
ou reembolso anterior à reserva exige revisão, sem enviar comprovante desatualizado.
O protocolo CLAIM/ACK e o diário local são os mesmos da cozinha. Falha após reserva
exige conferência; ACK não é confirmação física de papel. Não há garantia de exatamente
uma impressão física. Não reenviar automaticamente trabalhos incertos.

Quando o servidor indica impressão automática, o fechamento no navegador não imprime
outra via do comprovante. A impressão de documento fiscal autorizado continua separada;
reimpressões manuais permanecem disponíveis. Navegadores já abertos devem ser atualizados
após a publicação para receber a prevenção de segunda via.

Validação: teste de formatação ESC/POS e totais; integração PostgreSQL isolada com
oito consultas simultâneas, limite temporal, adesão explícita e isolamento entre lojas;
testes HTTP de reserva concorrente, ACK repetido e cancelamento antes de imprimir.
