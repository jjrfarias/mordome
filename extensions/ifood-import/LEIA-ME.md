# Mordomê + iFood — importação assistida

## Antes de usar

O servidor do Mordomê precisa conter a rota `/importar-ifood`, a API e a migração `20261108233000_ifood_assisted_import`. Instalar apenas a extensão não atualiza o servidor.

## Instalação no Edge ou Chrome

1. Extraia o ZIP em uma pasta permanente no computador da loja.
2. Abra `edge://extensions` ou `chrome://extensions`.
3. Ative **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha a pasta que contém `manifest.json`.
4. Fixe **Mordomê — Importar do iFood** na barra de extensões.
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
- Preços de linha + entrega precisam conferir com o subtotal; pagamento desconhecido bloqueia a importação.
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
