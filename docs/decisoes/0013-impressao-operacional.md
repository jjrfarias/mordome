# ADR 0013 — Impressão operacional por unidade e estação

## Status

Aceita em 12/09/2026. A primeira implementação usa a impressão do navegador e mantém aberta a evolução para um agente local ESC/POS.

## Contexto

O Mordomê precisa imprimir dois documentos diferentes: o comprovante não fiscal entregue ao cliente e a comanda de produção encaminhada à cozinha. Uma unidade pode ter várias estações, como chapa, fritadeira e bebidas, cada uma com sua própria impressora. A configuração não pode vazar entre estabelecimentos.

## Decisão

- A impressão de comprovante é configurada por estabelecimento na integração `PRINTER`.
- A impressão de produção é configurada separadamente em cada estação de preparo.
- O driver inicial `browser_print` abre o diálogo nativo do navegador. O driver `manual` não dispara impressão automática.
- Ao enviar uma rodada, cada estação recebe apenas os itens vinculados a ela.
- Reimpressões exigem a permissão `print.reprint`, validam organização e unidade no servidor e registram `PRINT_REPRINT` na auditoria antes de abrir o diálogo de impressão.
- O comprovante é não fiscal. NFC-e/SAT e integrações fiscais ficam fora desta etapa.

## Limitações conhecidas

O navegador não confirma ao sistema se o papel foi realmente impresso, se a impressora estava sem papel ou se o operador cancelou o diálogo. Portanto, o histórico registra a solicitação de impressão, não uma garantia física. Impressão silenciosa, monitoramento de fila, contingência local e suporte ESC/POS exigirão um agente instalado na rede do estabelecimento.

## Evolução prevista

Criar um agente local opcional que descubra impressoras, teste conexão, mantenha fila persistente e sincronize confirmações com a nuvem. Ele deverá preservar os identificadores de venda/pedido para garantir idempotência e evitar duplicidade após falhas de rede.
