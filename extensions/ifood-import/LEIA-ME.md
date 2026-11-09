# Mordomê + iFood e 99Food — importação assistida

## Antes de usar

O servidor do Mordomê precisa conter a rota `/importar-ifood`, a API e a migração `20261108233000_ifood_assisted_import`. Para 99Food, também exige a migração `20261110010000_food99_assisted_import`. Instalar apenas a extensão não atualiza o servidor.

## Instalação no Edge ou Chrome

1. Extraia o ZIP em uma pasta permanente no computador da loja.
2. Abra `edge://extensions` ou `chrome://extensions`.
3. Ative **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha a pasta que contém `manifest.json`.
4. Fixe **Mordomê — Importar iFood e 99Food** na barra de extensões.
5. Entre no Mordomê com um usuário autorizado a operar delivery e selecione a loja correta.

## Operação

1. Aceite o pedido no Gestor do iFood e abra seus detalhes.
2. Clique na extensão e em **Importar pedido aberto**. O endereço inicial é `https://mordome.jordaoconsultoria.com`.
3. Na aba do Mordomê, confira loja de origem/destino, quantidades, adicionais, observações e pagamento. Confirme para enviar à cozinha.
4. Na cozinha, inicie e conclua o preparo normalmente. No delivery, use **Retirado · encerrar produção** quando estiver pronto e for retirado.
5. Continue registrando aceite, despacho, entrega, cobrança e cancelamento no Gestor. A extensão não faz essas ações.

Cliques repetidos, reabertura da página e tentativas após falha de rede devolvem o pedido original. A chave usa o UUID completo do iFood por estabelecimento, e não o número curto que pode se repetir. Reimportar não atualiza um pedido já importado, mesmo que ele tenha sido cancelado no Mordomê.

## Limites desta primeira versão

- Captura exclusivamente o painel de detalhes aberto; não monitora a fila automaticamente.
- Não usa senha/token do iFood, APIs privadas ou requisições em segundo plano. A permissão `activeTab` é temporária e só é usada após o clique.
- Não importa pedidos já concluídos, cancelados ou em rota para a produção.
- Preços de linha + entrega precisam conferir com o subtotal; no iFood, pagamento desconhecido bloqueia a importação. No 99Food, o pagamento permanece não identificado e deve ser conferido no Gestor.
- Descontos e taxas permanecem no texto capturado. O subtotal não é apresentado como valor a cobrar.
- O 0800 do iFood não é cadastrado como telefone do cliente. Não há disparo de WhatsApp.
- Os produtos entram como descrições externas, sem vínculo automático com o catálogo, receitas ou estações. Aparecem na fila geral da cozinha. Não baixa estoque, não emite nota fiscal, não cria venda/recebível e não registra recebimento no caixa.
- Cobrança de pedidos importados é bloqueada no caixa, inclusive pela comanda vinculada. Confira o Gestor para cobrar somente quando necessário.
- Mudanças de layout podem interromper a leitura. Não force a importação se os dados estiverem incompletos. Combos/adicionais com estrutura diferente precisam de validação antes do uso.
- A tela exige banco persistente; a demonstração em memória não importa pedidos.

## Privacidade

A extensão guarda somente o endereço do Mordomê. O pedido é transferido pelo fragmento da URL, removido ao carregar a conferência; não é enviado na URL HTTP. Após confirmação, os dados ficam no banco da loja sob a sessão e as permissões existentes. O histórico do navegador pode reter transitoriamente a URL até a página carregá-la; use apenas o computador autorizado da loja.

## Validação

Estrutura DOM inspecionada no Gestor em 08/11/2026, versão Web 9.353.0. Os testes usam clientes e pedidos fictícios. Quantidade em `data-quantity`, preço de linha, subtotal, pagamento, falhas de leitura e duplicação concorrente foram cobertos. Não foram criados pedidos reais durante os testes.

## Atualização 0.1.1

Corrige a identificação da loja quando o Gestor usa `div role="button"`. Se a loja estiver ausente ou ambígua, explica a falha antes de abrir o Mordomê. Substitua os arquivos da pasta instalada e clique em Recarregar na extensão; depois abra o pedido e importe novamente.

## Versão 0.2.0 — iFood e 99Food

A mesma extensão reconhece a aba do Gestor iFood ou merchant.99app.com. Abra um pedido aceito em preparo, expanda seus detalhes e clique em **Importar pedido aberto**. Confira loja, produtos, adicionais e observações no Mordomê antes de enviar à cozinha.

Pedidos 99Food aparecem identificados como 99Food. O ID completo é preservado para impedir duplicações. O valor mostrado é o subtotal dos itens, sem confundir ganhos/repasse da loja com cobrança do cliente. Pagamento, descontos, entrega e cancelamento permanecem no Gestor. Se o pagamento não estiver identificado, consulte o 99Food; a importação não marca o pedido como pago nem registra recebimento no caixa.

O leitor foi baseado nos detalhes observados no Gestor. Formatos incompletos ou desconhecidos são bloqueados. Pedidos concluídos, cancelados, não aceitos ou já em entrega não são enviados à produção. A validação do primeiro pedido real em preparo ainda depende da disponibilidade de um pedido na loja.

Para atualizar no Edge: remova/desative a versão antiga e use **Carregar sem compactação** na pasta desta versão, ou substitua os arquivos da pasta já instalada e clique em **Recarregar** na extensão. Não instale duas versões ativas ao mesmo tempo. Não é necessário conceder acesso permanente a todos os sites: a leitura acontece apenas ao clicar.
