# 0074 — Importação assistida do Gestor iFood

Data: 08/11/2026. Implementação validada. A ativação exige publicar a API/migração e instalar a extensão no computador da loja.

Sem credenciais oficiais do iFood, a operação precisa evitar redigitação. Uma extensão MV3 lê o DOM visível do painel aberto e usa o UUID presente na rota. Não acessa estado React, cookies, tokens ou APIs internas. Seletores se baseiam na tela inspecionada do Gestor.

O destino é uma página do Mordomê autenticada. A captura chega pelo fragmento da URL, removido imediatamente. A confirmação exibe a loja ativa e é enviada com seu ID; troca de unidade em outra aba exige nova conferência. API exige sessão, `delivery.operate`, origem da requisição, confirmação explícita, schema e reconciliação do subtotal.

`DeliveryOrder.origin=IFOOD` e `ifoodImport` armazenam a captura validada. A chave `clientRequestId=ifood:<uuid>` aproveita a restrição única por estabelecimento. A criação do pedido antecede a cozinha dentro da mesma transação; o conflito único é tratado fora da transação abortada, devolvendo o pedido anterior. Assim, cliques concorrentes não geram comandas duplicadas. A mesma origem pode existir em estabelecimentos diferentes; a conferência da loja é obrigatória.

Os itens não são associados por nome ao catálogo: isso poderia consumir receita ou cobrar preço incorreto. Produção usa a mesa virtual Balcão e o fluxo `Tab → Order → OrderItem`, com adicionais/observações e número iFood na fila e impressão. A retirada encerra produção e o registro operacional de delivery, sem afirmar confirmação de entrega no iFood. A comanda técnica não é convertida em venda.

Não há emissão fiscal, estoque, financeiro, polling, sincronização de alterações/cancelamentos ou entrega. A API de vendas rejeita a cobrança do pedido e de sua comanda. Pagamento online é sinalizado como já pago. O telefone intermediado 0800 não vira cadastro de cliente nem destino de WhatsApp.

Pedidos encerrados/em rota, pagamento desconhecido e divergência de subtotal bloqueiam nova importação. Nova tentativa de um UUID existente devolve a referência anterior e não muda seus dados ou status.

Testes: `tests/ifood-import.test.ts` usa fixture DOM anonimizada; `scripts/check-ifood-import-postgres.ts` exige PostgreSQL local isolado e valida oito chamadas concorrentes, retry, rollback após criação da cozinha, isolamento, autenticação, CSRF, confirmação, fluxo da cozinha e bloqueio de pagamento. Manual e instalação em `extensions/ifood-import/LEIA-ME.md`.

Limitação de verificação: foram observados dois pedidos reais sem adicionais. Fixtures cobrem adicionais e observações, mas outras estruturas de combos/adicionais devem ser conferidas em pedidos reais antes de uso sem supervisão. Atualizações do Gestor podem exigir revisão dos seletores.
