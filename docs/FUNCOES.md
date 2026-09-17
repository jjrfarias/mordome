# Catálogo funcional

## Organização e estabelecimentos — primeira fatia implementada

- Criar e editar dados da organização.
- Criar múltiplos estabelecimentos por organização.
- Definir nome, CNPJ opcional, telefone, endereço, horário e taxa de serviço por unidade.
- Selecionar a unidade ativa em componente persistente. **Implementado:** o seletor exibe somente acessos da associação, persiste a escolha na sessão e rejeita IDs não autorizados.
- Consolidar indicadores das unidades permitidas ao usuário.
- Impedir qualquer leitura ou escrita em unidade não autorizada.
- Gerenciar unidades na área de **Configurações** (sem excluir): criar, editar nome e alterar status ativo/inativo. **Implementado para o perfil Proprietário**, com verificação repetida no servidor.
- Cadastrar novos estabelecimentos com slug exclusivo por organização e auditoria de alterações.
- Bloquear a desativação da unidade ativa atual e do único estabelecimento ativo da organização.

No protótipo local, o estado operacional também é armazenado sob uma chave específica por estabelecimento para não misturar vendas e comandas durante a troca. Nesta etapa, documento e telefone permanecem para próxima tela, conforme diretriz de implementação.

## Usuários e acesso — primeira fatia implementada

- Criar usuários com nome, identificador de login e senha inicial, sem usar e-mail no acesso cotidiano.
- Suspender e reativar a associação do usuário à organização, sem apagar seu histórico.
- Criar, editar, ativar e desativar perfis personalizados por organização.
- Associar um ou vários perfis ao usuário; as permissões dos perfis ativos são acumuladas.
- Limitar cada usuário a um ou vários estabelecimentos específicos.
- Conceder ou bloquear permissões individuais como exceção.
- Exibir ao administrador as permissões efetivas, a origem nos perfis e os bloqueios/liberações individuais.
- Configurar exceções individuais como `herdar`, `liberar` ou `bloquear`, sempre com justificativa; o bloqueio prevalece.
- Redefinir senha mediante permissão específica, encerrando as sessões anteriores do usuário.
- Auditar criação, suspensão, redefinição de senha e alterações de perfis/unidades com estados anterior e posterior.
- Impedir a suspensão ou remoção do perfil do último proprietário ativo da organização.

Permissões administrativas independentes: `users.view`, `users.invite`, `users.disable`, `users.password.reset` e `roles.manage`. O resumo financeiro usa `finance.summary.view`, permitindo criar um perfil de atendente com ajuda financeira sem liberar toda a administração.

## PDV rápido — catálogo e venda transacional implementados

- Pesquisar e filtrar produtos pré-cadastrados.
- Adicionar, incrementar, reduzir e remover itens.
- Selecionar forma de pagamento.
- Finalizar venda sem mesa ou comanda.
- Registrar a origem `PDV` no resumo.
- Carregar somente ofertas ativas no canal `POS` da unidade atual.
- Persistir venda, pagamento, snapshot de preço/receita e consumo de estoque na mesma transação.
- Impedir consumo duplicado por chave de idempotência.
- **Envia o pedido para a cozinha (ADR 0044):** cada venda concluída cria, na mesma transação, um pedido (`Order`) na mesa virtual "Balcão" — aparece na aba Cozinha com o mesmo rastreio de status (Recebido → Em preparo → Pronto → Entregue) e a mesma impressão por fila de preparo do Salão, sem precisar de um botão "enviar" separado (finalizar a venda já basta). Produto sem fila de preparo configurada não gera tíquete, mesmo critério do Salão.

Implementado: novas vendas exigem uma sessão de caixa aberta pelo mesmo operador na unidade ativa e recebem seu `cashSessionId`.

Planejado: desconto autorizado, identificação de cliente, pagamento dividido, impressão e cancelamento pela interface.

## Salão, comandas e cozinha — persistência operacional implementada

- Visualizar e filtrar mesas.
- Abrir comanda ao adicionar o primeiro produto.
- Adicionar, alterar e remover itens.
- Enviar pedido para cozinha.
- Fechar conta e liberar mesa.
- Carregar somente ofertas ativas no canal `FLOOR` da unidade atual.
- Ao fechar, persistir venda, serviço, pagamento, snapshot e baixa automática de estoque.
- Mesas, comandas, itens e rodadas de pedido pertencem à unidade ativa e são carregados do servidor.
- O primeiro item abre a comanda; cada rodada enviada à cozinha preserva seus itens e o usuário responsável.
- Itens já enviados não podem ser simplesmente reduzidos; o cancelamento justificado será um fluxo específico.
- Cada mudança entre recebido, em preparo, pronto e entregue preserva ator e horário.
- O fechamento usa os itens e preços preservados na comanda, vincula a venda e libera a mesa na mesma transação.
- A trilha registra quem abriu, adicionou, enviou, preparou e fechou cada mesa.

Implementado: item já enviado pode ser cancelado parcialmente por operador autorizado, sempre com quantidade, motivo, responsável e aviso visível na cozinha. O item não é apagado; cada cancelamento fica vinculado à rodada original.

Planejado: reservas, cliente opcional, observações, complementos, transferência e união de mesas, divisão por pessoa/item/valor e desconto autorizado.

## Cozinha — persistência operacional implementada

- Listar pedidos enviados pelo salão.
- Avançar entre recebido, em preparo, pronto e entregue.
- Organizar por tempo e destacar atraso.

O histórico de status e seus responsáveis está implementado. Planejado: atualização por push em tempo real, estações de preparo e reimpressão.

## Produtos, cardápio e receitas — primeira fatia implementada

> As decisões funcionais estão aprovadas e registradas no ADR 0006.

- Categorias, nome, descrição, preço, disponibilidade, variações, complementos e pesquisa.
- Disponibilidade e preço podem variar por estabelecimento.
- Um catálogo poderá ser compartilhado na organização, preservando configurações por unidade.
- O mesmo produto poderá ser habilitado separadamente para PDV, salão, menu online e delivery.
- A ficha técnica define o consumo automático de itens de estoque em unidade-base (`g`, `ml` ou `un`).
- Produtos de revenda podem consumir diretamente uma unidade de estoque; materiais sem vínculo com venda recebem baixa manual.
- Variações e adicionais podem modificar preço e consumo da receita.
- **Primeira fatia implementada:** tela administrativa para cadastrar produto, categoria, preço e canais da unidade ativa; editar preço e canais de ofertas existentes.
- **Fundação persistente implementada em schema/migração:** variantes, ofertas por canal, itens de estoque, conversões, movimentos e receitas de venda ou pré-preparo.
- **Estoque implementado:** cadastro de insumos, unidade-base, forma de controle, mínimo, ativação por estabelecimento e entrada com conversão e custo.
- **Fichas técnicas implementadas:** vínculo de um produto vendido a vários itens de estoque, quantidade em unidade-base e perda técnica.
- **Análise/simulação de CMV (implementado):** sub-aba "Simulação de CMV" dentro de Fichas técnicas, ao lado da sub-aba "Fichas técnicas". Diferente do Relatório de CMV (que olha vendas JÁ OCORRIDAS), é uma calculadora "e se": o dono escolhe um produto (existente, pré-carregando sua ficha técnica atual e preço de venda atual, se houver) ou começa do zero (produto sem ficha ainda), e pode editar livremente, só na tela — sem salvar nada —, a composição (item de estoque, quantidade, perda técnica), o rendimento e o preço de venda simulado, vendo em tempo real (cálculo 100% client-side) o CMV projetado, CMV%, margem bruta e margem% para uma unidade vendida. Cada componente mostra a quantidade consumida (com perda aplicada, mesma fórmula de `calculateRecipeConsumption`) e o custo médio ponderado ATUAL do insumo; item sem nenhuma entrada de custo registrada nunca é mascarado como custo zero — aparece como "custo desconhecido" e sinaliza a simulação como custo parcial. Botão "Usar como base" pré-preenche o formulário de cadastro de ficha técnica (sub-aba "Fichas técnicas") com os dados simulados — não salva nada sozinho; como o sistema não tem edição de ficha técnica existente (só cadastro), isso é útil principalmente para produtos ainda sem ficha. Dados iniciais (produtos com preço de venda atual da unidade e itens de estoque com custo médio) vêm da mesma rota `GET /api/admin/recipes` já usada pela tela de Fichas técnicas, estendida com os campos `products[].price` e `inventoryItems[].averageCost` — nenhuma rota nova. Cálculo extraído em função pura testada (`lib/cmv.ts`: `calculateCmvSimulation`, reaproveitando `weightedAverageCost` e `calculateRecipeConsumption`). Permissão `recipes.manage` (mesma da tela de Fichas técnicas). Ver ADR 0027.
- **Operação implementada:** PDV e salão carregam o catálogo persistido da unidade e a venda realiza a baixa automática transacional da ficha técnica.
- **Grupos de ingrediente implementados (ver ADR 0022):** o dono cadastra, por produto, grupos de opções escolhidas manualmente no momento da venda (ex.: "Molhos" com mínimo/máximo de seleção, "Adicionais" com acréscimo de preço por opção), na própria tela de Cardápio (`catalog.manage`). Diferente da ficha técnica: aqui não há consumo automático de estoque, é uma escolha do cliente/atendente que pode alterar o preço final do item. **Integrado de ponta a ponta nos três canais de venda (PDV, Salão e Delivery)**: ao adicionar um produto com grupo ativo ao carrinho/comanda/pedido, abre um passo de seleção com validação de mínimo/máximo e resumo do preço antes de confirmar; produto sem grupo continua sendo adicionado direto, sem nenhum passo extra. O preço final e a validação são sempre recalculados no servidor. A escolha fica gravada no item correspondente (`TabItem.selectedOptionsSnapshot` na comanda, `DeliveryOrderItem.selectedOptionsSnapshot` no pedido de delivery, `SaleItem.selectedOptionsSnapshot` na venda concluída), no mesmo padrão do retrato de ficha técnica, e aparece de forma legível para a cozinha no KDS do Salão (`FloorManagement.tsx`).
- **Foto de produto implementada (ver ADR 0032):** o dono envia uma foto por produto no cadastro do Cardápio (`catalog.manage`), com upload de arquivo comprimido no próprio navegador (redimensionado a no máximo 800px no maior lado, JPEG qualidade ~0.7) e guardado como data URL base64 em `Product.imageUrl` — sem storage de objeto externo (decisão desta fatia, ver ADR). A foto aparece no cardápio público, no pedido online, no PDV e na grade de produtos do Salão; produto sem foto continua mostrando o placeholder/emoji de sempre, sem quebra de layout. Limite de tamanho validado no servidor (`lib/catalog-validation.ts`) mesmo com a compressão do cliente.

## Delivery (implementado)

- Central de delivery própria (`components/operations/DeliveryManagement.tsx`, `delivery.operate`): pedido com cliente, telefone, endereço, ponto opcional no mapa, itens do cardápio habilitado para o canal delivery (com grupos de ingrediente, ver ADR 0022) e observações. Board por etapa (Recebido → Em preparo → Saiu para entrega → Entregue/Cancelado), atribuição de entregador, mapa com destino/entregadores em tempo real e cobrança na entrega (gera a `Sale` do canal `DELIVERY`).
- Origem do pedido preservada (`DeliveryOrder.origin`: `INTERNAL`/`ONLINE`) sem acoplar o catálogo a um marketplace.
- **Áreas de entrega implementadas (ver ADR 0028):** cadastro simples por estabelecimento (`DeliveryArea`, permissão `catalog.manage`) com nome, taxa de entrega fixa e bairros atendidos em texto livre — sem geolocalização real (raio/polígono), decisão deliberada para manter o cadastro simples nesta fatia. Gerenciado por um painel dentro da própria Central de Delivery (`components/operations/DeliveryAreaSettings.tsx`), nunca excluído, apenas inativado. Ao criar um pedido, o atendente pode opcionalmente escolher uma área cadastrada: a taxa aparece separada do subtotal dos produtos, some ao total do pedido em tempo real antes de confirmar, e fica gravada como snapshot (`DeliveryOrder.deliveryAreaId`/`deliveryFee`) e refletida em `Sale.deliveryFee` na venda concluída (mesmo padrão de `serviceAmount` do Salão). Pedidos sem área selecionada continuam sem qualquer taxa adicional, exatamente como antes desta fatia.
- Entregadores, despacho e conciliação de acertos por entregador já implementados (ver ADR 0018). Rastreamento por geolocalização do entregador implementado via `CourierLocation` (ver `CourierApp.tsx`).

## Motivos de cancelamento (implementado, ver ADR 0029)

- Cadastro de motivos pré-definidos por categoria (`CancellationReason`, escopo por organização, permissão `establishments.manage` para criar/editar) cobrindo os três fluxos de cancelamento/estorno: cancelamento de venda (`SALE_CANCEL`), cancelamento de item de comanda já enviado à cozinha (`ITEM_CANCEL`) e reembolso (`REFUND`). Caixa e Reimpressão continuam com texto livre — não são "cancelamentos" no sentido desta fatia.
- Gerenciado em nova sub-aba "Motivos de cancelamento" em Configurações (`components/admin/CancellationReasonsManagement.tsx`), com filtro por categoria; nunca excluído, apenas inativado.
- Nos três fluxos, o campo de texto livre de motivo foi trocado por um seletor (`components/operations/ReasonSelect.tsx`) que busca os motivos ativos da categoria e sempre inclui uma opção final "Outro (digite o motivo)", que revela um campo de texto livre como fallback. Se não houver nenhum motivo cadastrado ainda, o campo de texto livre aparece direto, sem bloquear o cancelamento. O texto final enviado ao servidor continua sendo uma string livre — nenhum contrato de API dos endpoints de cancelamento existentes mudou.
- Roteirização (cálculo de rota/tempo estimado via serviço externo) segue pendente — ver ADR 0014.

## Cupons de desconto (implementado, ver ADR 0041)

- Cadastro de cupons de desconto (`Coupon`, escopo por organização — vale para toda a rede,
  permissão `catalog.manage`): código único por organização, tipo de desconto (`PERCENT` 0-100% ou
  `FIXED` em R$), validade opcional (`validFrom`/`validUntil` — sem validade nunca expira daquela
  ponta), limite de usos opcional (`maxUses` nulo = ilimitado) e contador de usos (`usesCount`).
  Nunca excluído, apenas inativado. Gerenciado em nova sub-seção "Cupons de desconto" em
  Configurações (`components/admin/CouponsManagement.tsx`).
- Integrado apenas ao PDV nesta fatia (Salão e Delivery ficam de fora, pendência futura): o
  operador digita o código antes de finalizar a venda, o PDV valida assistidamente
  (`POST /api/operations/coupons/validate`) e, se o cupom estiver utilizável (ativo, dentro da
  validade, dentro do limite de usos), aplica automaticamente como o `discount`/`discountReason`
  que já existem na finalização de venda (`app/api/operations/sales/route.ts`) — o cupom é só uma
  forma alternativa e assistida de preencher esse desconto, sem novo campo em `Sale`. O servidor
  sempre recalcula o desconto do cupom no momento de finalizar a venda (nunca confia no valor já
  calculado pelo cliente na validação).
- Cada uso efetivo em uma venda concluída incrementa `Coupon.usesCount` e cria um
  `CouponRedemption` (cupom, venda, estabelecimento, valor de desconto aplicado) — consultado pelo
  relatório "Cupons gerados". A validação isolada (sem finalizar a venda) não incrementa nada.
- Relatório **Cupons gerados** (ver ADR 0041, permissão `reports.coupons_generated.view`): lista
  todos os cupons cadastrados até o fim do período ("gerados" = criados, não só os usados), com
  validade, limite, usos totais (histórico) e usos/desconto concedido especificamente dentro do
  período consultado.

## Turnos — escala de trabalho da equipe (implementado, ver ADR 0030)

- Cadastro de turnos de trabalho (`WorkShift`, escopo por estabelecimento, permissão `establishments.manage`): nome, horário de início/fim (`HH:mm`) e dias da semana em que ocorre. **Não é o turno de caixa** (`CashSession`, abertura/fechamento de caixa por operador) — é a escala/horário de trabalho da equipe, sem relação com dinheiro ou vendas.
- Atribuição de usuários a turnos (`WorkShiftAssignment`, relação N:N por `OrganizationMembership`, mesma unidade de identidade usada por `EstablishmentAccess`/`MembershipRole`): um usuário pode ter zero, um ou mais turnos. Atribuir o mesmo usuário duas vezes ao mesmo turno é idempotente (não gera erro nem duplicidade).
- Gerenciado em nova sub-aba "Turnos" em Configurações (`components/admin/WorkShiftsManagement.tsx`), com seletor de dias da semana em chips clicáveis e uma lista de checkboxes por turno para atribuir/desatribuir a equipe da unidade; nunca excluído, apenas inativado.
- Sem lógica de negócio automática associada nesta fatia: não há controle de ponto, cálculo de horas trabalhadas, nem bloqueio de operações fora do turno cadastrado — é a base para funcionalidades futuras desse tipo.

## Modelos de impressão — aparência do recibo de venda (implementado, ver ADR 0031)

- Cadastro de personalização visual do recibo impresso de venda (`PrintTemplate`, um registro por estabelecimento, permissão `integrations.manage`): texto de cabeçalho opcional (ex. endereço/telefone), texto de rodapé opcional (ex. mensagem de despedida), exibir ou não o CNPJ/documento do estabelecimento (`Establishment.document`) e largura do papel (58mm ou 80mm).
- Não altera a lógica de itens/total/pagamento do recibo, apenas a aparência. O recibo da cozinha (`printKitchenOrder`) não é afetado — fica fora de escopo.
- Sem configuração, o recibo sai idêntico ao formato original (80mm, sem cabeçalho/rodapé extra, sem documento) — nenhuma unidade sofre regressão visual.
- Gerenciado em nova sub-seção "Modelos de impressão" dentro de Integrações (`components/admin/IntegrationsManagement.tsx`), com prévia ao vivo do recibo num `<iframe>` que atualiza a cada alteração do formulário, sem precisar imprimir de verdade.
- O template chega à tela de vendas embutido na sessão (`session.printTemplate`, resolvido junto com `printerDriver` em `getCurrentSession`/`getLocalSession`) — não há chamada de rede extra a cada impressão.

## Mordomê Continuidade — proposta futura

- Recurso opcional por estabelecimento para operação em nuvem + servidor local.
- Com internet disponível, cada operação local deve ser enviada imediatamente e aparecer no painel remoto em poucos segundos.
- Sem internet ou nuvem, a unidade continua na rede interna e acumula uma fila durável para sincronização automática posterior.
- O painel remoto sinaliza a última comunicação e não apresenta dados offline como se fossem atuais.
- Instalação pretendida por aplicativo/script guiado e código temporário de pareamento, sem configuração manual de banco ou containers pelo cliente.
- Arquitetura, tecnologias, conflitos, segurança e modelo comercial ainda serão amadurecidos. Fonte: ADR 0008.

## Caixa — primeira fatia implementada

- Abertura e fechamento por estabelecimento e operador.
- Suprimentos e retiradas/sangrias com valor, ator, data, justificativa e chave idempotente.
- Resumo esperado por forma de pagamento, incluindo valor inicial e movimentos em dinheiro.
- Conferência por forma de pagamento e registro imutável da divergência no fechamento.
- Uma venda nova só pode ser finalizada com caixa aberto pelo operador na unidade ativa.
- Permissões independentes para abrir, movimentar, fechar e consultar histórico.
- Interface com estados de carregamento, erro, caixa fechado, caixa aberto e histórico da unidade.

Cancelamento de venda concluída exige `pos.cancel_sale`, motivo e caixa original ainda aberto. Ele retira a venda da conferência, estorna o estoque uma única vez e preserva venda, pagamento e auditoria. Depois do fechamento do caixa, a operação correta será um reembolso, ainda planejado.

Planejado: pagamento dividido, reembolso após fechamento, reabertura administrativa auditada, impressão do fechamento e política configurável para operações excepcionais sem caixa.

## Estoque — primeira fatia implementada

- Insumo ou produto controlado por unidade.
- Quantidade, unidade de medida e estoque mínimo.
- Entrada, saída e ajuste com motivo e ator.
- Alertas de estoque baixo.
- Conversão de entrada para unidade-base, como `1 kg = 1.000 g`.
- Movimentos imutáveis para entrada, consumo automático, perda, ajuste, transferência e estorno.
- Consumo transacional por receita, preservando snapshot da composição usada na venda.
- Transferência entre unidades autorizadas, com baixa na origem, entrada no destino, conservação da quantidade e auditoria.

Cadastro, configuração por estabelecimento, conversão de entrada, saldo, transferência, consumo automático por venda e estorno possuem domínio/API. Ajustes manuais e a tela operacional de cancelamento entram em etapa posterior.

- **Ordem de compra (implementado):** sub-aba "Ordens de compra" dentro do Estoque, entre "Itens de estoque" e "Notas de entrada", para planejar uma compra antes da mercadoria chegar. Uma ordem (`PurchaseOrder`) referencia um fornecedor opcional, data prevista de entrega opcional e observações, e agrupa itens (`PurchaseOrderItem`: item de estoque já configurado na unidade, quantidade, custo unitário estimado). Fluxo `DRAFT` (editável — adicionar/remover item, editar cabeçalho) → `SENT` (marca como enviada ao fornecedor, trava edição de itens/cabeçalho) → `RECEIVED` (terminal, alcançado só pela ação "Gerar nota de entrada"); `CANCELLED` é permitido a partir de `DRAFT` ou `SENT`, nunca de `RECEIVED`. "Gerar nota de entrada" (disponível em `DRAFT` e `SENT`) cria, numa transação atômica, uma `GoodsReceiptNote` nova em `DRAFT` com os mesmos itens/quantidades (custo estimado vira custo inicial da nota, editável lá) e marca a ordem como `RECEIVED` guardando `generatedNoteId` — essa é a ÚNICA integração com o estoque real; a ordem em si nunca gera `StockMovement`. Permissão `stock.manage`. Ver ADR 0021.
- **Contagem de estoque (implementado):** sub-aba "Contagem de estoque" dentro do Estoque, ao lado de "Itens de estoque", "Ordens de compra" e "Notas de entrada". Diferente do formulário pequeno de ajuste por item (que continua existindo em cada linha de "Itens de estoque"), esta tela lista de uma vez todos os itens configurados na unidade com um campo "Contagem física" por item (vazio por padrão — item não preenchido não é tocado) e mostra ao lado a diferença calculada (contado − saldo do sistema), destacando sobra em verde e falta em laranja/vermelho. Um resumo no topo mostra quantos itens têm contagem preenchida e quantos têm diferença; "Confirmar contagem" abre um modal listando exatamente os itens que serão ajustados (com o delta de cada um) e pede um único motivo para toda a sessão (ex.: "Contagem mensal de 16/09"), aplicado a todos os ajustes gerados. Reaproveita a mesma regra de cálculo do ajuste individual de contagem física (`resolvePhysicalCountAdjustment` em `lib/inventory-domain.ts`) via uma nova ação em lote (`BULK_PHYSICAL_COUNT`) na mesma rota `/api/admin/inventory`, gerando um `StockMovement`/`AuditEvent` por item ajustado (não um evento genérico) numa transação atômica — se um item falhar, nenhum ajuste da sessão é aplicado. Itens sem contagem preenchida ou com contagem igual ao saldo não geram movimento. Não é uma tela de histórico de contagens passadas (isso fica fora de escopo — ver ADR 0023). Permissão `stock.adjust` (mesma do ajuste individual).
- **Lista de compras (implementado):** sub-aba "Lista de compras" dentro do Estoque, ao lado de "Itens de estoque", "Ordens de compra", "Notas de entrada" e "Contagem de estoque". Combina duas fontes: sugestões automáticas (todo item configurado com `minimumStock > 0` e saldo atual abaixo dele, calculadas em tempo real — não persistidas, e somem sozinhas quando o saldo sobe), com quantidade sugerida `minimumStock - saldo` arredondada para cima em 3 casas decimais (`suggestedPurchaseQuantity` em `lib/inventory-domain.ts`); e itens manuais (`ShoppingListItem`: item de estoque já configurado, quantidade desejada, observação opcional), persistidos para permitir intenções de compra que não dependem de estar abaixo do mínimo (ex.: "comprar mais churrasco pro fim de semana") e para poderem ser marcados como "já providenciado" (`resolved: true`) sem virar ordem de compra. Cada linha (sugestão ou manual) tem uma caixa de seleção; "Gerar ordem de compra" cria, para os itens selecionados e um fornecedor opcional, uma `PurchaseOrder` em `DRAFT` reaproveitando a mesma sequência de criação de ordem já usada pela tela "Ordens de compra" (nunca duplicada), com custo estimado inicial zero (editável depois lá); itens manuais selecionados são marcados `resolved: true` no mesmo passo, itens automáticos continuam reaparecendo enquanto o saldo real seguir baixo. Permissão `stock.manage` (mesma do restante do módulo de estoque, não `stock.adjust` — não é uma operação de ajuste de saldo). Ver ADR 0024.
- **Histórico de posição de estoque (implementado):** sub-aba "Histórico de posição" dentro do Estoque, entre "Contagem de estoque" e "Lista de compras". Consulta somente leitura (não escreve `StockMovement`) que mostra, para um item de estoque escolhido e um período (mesmo padrão de atalhos "Hoje"/"Esta semana"/"Este mês" do Fluxo de caixa), a lista cronológica de cada movimentação com data/hora, tipo traduzido para português (Entrada, Consumo, Perda, Ajuste, Transferência entrada/saída, Estorno, Produção entrada/saída), quantidade com sinal e o saldo acumulado (running balance) após aquele movimento; no topo mostra saldo no início do período (soma de tudo antes do "de"), saldo no fim, total de entradas e total de saídas. Diferente da Contagem de estoque (que serve para registrar ajustes) e da Auditoria genérica (que mistura todas as ações do sistema sem saldo acumulado) — não existia nenhuma tela de histórico por item antes desta fatia. Rota `GET /api/admin/inventory/position-history`, permissão `stock.manage`. Ver ADR 0025.
- **Relatório de CMV real (implementado):** sub-aba "Relatório de CMV" dentro do Estoque, entre "Histórico de posição" e "Lista de compras". Mostra, para um período (mesmo padrão de atalhos "Hoje"/"Esta semana"/"Este mês" do Fluxo de caixa), o CMV real das vendas concluídas (`COMPLETED`/`PARTIALLY_REFUNDED`): Receita, CMV, CMV%, Margem bruta e Margem%, além do detalhamento por produto (quantidade, receita, CMV, CMV%, ordenado por CMV decrescente). CMV de cada produto = soma, por componente da ficha técnica usada na venda (`SaleItem.recipeSnapshot` no servidor; ficha técnica atual do produto reconstituída a partir do evento de auditoria `SALE_COMPLETE` em modo local), da quantidade consumida × custo médio ponderado ATUAL do insumo (`custoMedio = soma(quantidade × custoUnitário) / soma(quantidade)` sobre todo o histórico de `StockMovement` tipo `ENTRY` com custo registrado — não é FIFO nem custo histórico por data, é sempre o custo médio de hoje, mesmo para vendas passadas do período). Item sem nenhuma entrada com custo registrado tem custo "desconhecido" (nunca 0) e o produto correspondente aparece com "custo parcial" destacado; produto sem ficha técnica não entra no CMV e aparece à parte, em "Vendas sem ficha técnica", com quantidade e receita. CMV%/Margem% são calculados sobre a receita total do período (com ou sem ficha técnica). Cálculo extraído em funções puras testadas diretamente (`lib/cmv.ts`: `weightedAverageCost`, `calculateSaleItemCmv`, `buildCmvReport`). Pré-requisito corrigido nesta fatia: modo local não gravava `unitCost` em nenhuma entrada de estoque (o campo já existia na UI/API e era descartado) — corrigido em `lib/local-inventory.ts`. Rota `GET /api/admin/inventory/cmv-report`, permissão `finance.summary.view` (visão gerencial, cruza estoque e financeiro). Sem persistência nova — cálculo sob demanda. Ver ADR 0026 para as limitações assumidas (custo médio "atual", não histórico por data).
- **Notas de entrada (implementado):** sub-aba "Notas de entrada" dentro do Estoque para registrar a chegada de mercadoria de um fornecedor com custo unitário real. Uma nota (`GoodsReceiptNote`) referencia um fornecedor opcional, número da nota/fatura opcional, data de recebimento e observações, e agrupa itens (`GoodsReceiptItem`: item de estoque já configurado na unidade, quantidade, custo unitário). Fluxo rascunho (`DRAFT`, editável — pode adicionar/remover item e editar cabeçalho) → confirmada (`CONFIRMED`, via `POST /api/admin/inventory/goods-receipts/confirm`, que gera um `StockMovement` tipo `ENTRY` por item numa transação atômica e trava a nota); não é possível confirmar nota vazia nem confirmar a mesma nota duas vezes. É uma camada de agrupamento/documentação sobre o `StockMovement` já existente, não um novo conceito de saldo de estoque. Permissão `stock.manage` (mesma de todo o módulo de estoque). Pode ser gerada automaticamente a partir de uma Ordem de compra (ver acima). Ver ADR 0020.

## Financeiro — núcleo básico implementado

- Categorias financeiras por organização, com tipo receita ou despesa (`finance.manage`).
- Contas bancárias cadastráveis por estabelecimento (banco, agência, conta e saldo inicial), sem cálculo de saldo corrente ainda (`finance.manage`).
- Formas/métodos de pagamento configuráveis por estabelecimento (nome, tipo, taxa e prazo de repasse), distintos do meio de pagamento usado no PDV (`finance.manage`).
- Lançamentos financeiros manuais (contas a pagar e a receber), com categoria, conta bancária e forma de pagamento opcionais, vencimento, status pendente/pago e observações (`finance.entries.manage`).
- **Fluxo de caixa (implementado):** tela consolidada por período (padrão: mês corrente, com atalhos "Hoje"/"Esta semana"/"Este mês" e seleção livre de data "de"/"até"), somando em regime de caixa: lançamentos financeiros com status pago (`paidAt` no período, entrada se a categoria é receita e saída se é despesa) e vendas concluídas do PDV/salão/delivery (`Sale.total` no período, sempre como entrada) e movimentações manuais de caixa (`CashMovement`: suprimento como entrada, retirada como saída). Mostra total de entradas, total de saídas, saldo do período e saldo acumulado (soma do `BankAccount.initialBalance` de todas as contas do estabelecimento mais o saldo do período, sem reconciliar por conta individual) e a lista cronológica dos lançamentos que compõem o total. Somente leitura, permissão `finance.cashflow.view`. Ver ADR 0016 para as decisões de modelagem e limitações assumidas.
- **Fornecedores (implementado):** cadastro básico por organização (nome/razão social, nome fantasia, documento CNPJ/CPF opcional validado apenas por tamanho, telefone/WhatsApp, e-mail, observações, ativo/inativo), sem exclusão — apenas inativação, permissão `finance.manage`. Pode ser vinculado opcionalmente a um lançamento financeiro (`FinancialEntry.supplierId`) na tela de Lançamentos, para registrar "quem foi pago". É um cadastro compartilhado que também será usado futuramente por Notas de entrada/Ordem de compra em Estoque. Ver ADR 0017.
- **Acertos de entregadores e garçons (implementado):** cadastro simples de regra de comissão por usuário/estabelecimento (`UserCommissionRule`), com valor fixo por entrega OU percentual sobre vendas de salão (nunca os dois), permissão `settlements.manage`. A tela lista, por período (mesmo padrão de atalhos do fluxo de caixa), todo usuário que teve ao menos uma entrega concluída (`DeliveryOrder.courierId`, status `DELIVERED`) ou uma venda de salão concluída (`Sale.operatorId`, canal `FLOOR`) no intervalo, mesmo sem regra configurada (aparece com valor zero). Um clique em "Marcar como acertado" grava um `SettlementRecord` (valor, período, quem pagou) e impede duplicidade exata do mesmo usuário/papel/período; períodos parcialmente sobrepostos não são bloqueados (limitação conhecida). Histórico de acertos pagos listado na mesma tela. Ver ADR 0018 para os critérios de cálculo e suas simplificações deliberadas.
- **Conciliação bancária (implementado):** tela por conta bancária e período (mesmo padrão de atalhos do fluxo de caixa) que lista os lançamentos financeiros pagos vinculados àquela conta (`FinancialEntry.bankAccountId`, `status = PAID`, `paidAt` no período) para o dono/gerente marcar manualmente cada um como conciliado (`reconciled`/`reconciledAt`/`reconciledById`) conforme confere o extrato real do banco, com ação "marcar todos os filtrados como conciliados". Mostra total lançado, total conciliado e total pendente de conciliação no período. Diferente do Fluxo de caixa (que soma lançamentos + vendas + movimentações de caixa), a conciliação bancária só considera lançamentos com conta bancária específica associada — vendas e movimentações de caixa não entram. Sem importação de extrato (OFX/CSV) nem matching automático — conciliação deliberadamente manual. Permissão `finance.entries.manage` (mesma da aba Lançamentos). Ver ADR 0019.
- Ver ADR 0015 para as decisões do núcleo básico. Importação/matching automático de extrato bancário permanece fora deste escopo (notas de entrada e ordem de compra foram implementadas dentro de Estoque, ver ADR 0020 e ADR 0021).

## Relatórios — framework + 2 relatórios implementados (ver ADR 0033)

- Tela única "Relatórios" (`components/admin/ReportsWorkspace.tsx`): navegação lateral lista apenas
  os relatórios que a sessão tem permissão de ver (catálogo central em `lib/reports/registry.ts`,
  filtrado por `session.permissionKeys`); a área principal renderiza o relatório selecionado. Sem
  nenhuma permissão de relatório, mostra estado vazio claro em vez de quebrar.
- Permissão granular por relatório individual: cada relatório tem sua própria chave
  `reports.<slug>.view` (ex. `reports.sales_by_period.view`), então um perfil pode enxergar um
  relatório sem ver outro — ver `docs/AUTORIZACAO.md`.
- Tabela de relatório reutilizável (`components/admin/reports/ReportTable.tsx`): ordenação por
  coluna (clique no cabeçalho), formatação de moeda/data consistente com o resto do sistema
  (`money()` de `lib/domain.ts`), resumo no rodapé e dois botões de exportação.
- Exportação reutilizável em Excel (`exceljs`) e PDF (`jspdf` + `jspdf-autotable`), geradas no
  navegador sem serviço externo — `lib/reports/export.ts`. Nenhum relatório implementa exportação
  própria.
- Filtro de período reutilizável (`components/admin/PeriodFilter.tsx`): De/Até + atalhos
  Hoje/Esta semana/Este mês, extraído da duplicação que existia em `FinanceManagement.tsx`.
- Relatório **Vendas por período**: uma linha por venda concluída (`COMPLETED`/`PARTIALLY_REFUNDED`)
  no período — data/hora, canal, mesa, forma de pagamento, valor bruto, desconto, valor líquido —
  com resumo de total de vendas, valor total e ticket médio.
- Relatório **Faturamento por dia**: agrega as vendas do período por dia (quantidade, bruto,
  descontos, líquido), em ordem cronológica, com total geral.
- Relatório **Desempenho por atendente/garçom** (ver ADR 0034): ranking de vendas por pessoa no
  período (quantidade, valor líquido total, ticket médio), em duas seções — Atendentes (canal PDV) e
  Garçons (canal Salão), já que a mesma pessoa pode operar os dois. Ordenado por valor líquido total
  vendido, decrescente. Pessoa sem vendas no período não aparece. Usa o mesmo critério de
  `Sale.operatorId` já usado por Acertos (ADR 0018) para identificar o operador, mas é **apenas uma
  visão de desempenho — não calcula comissão** (isso continua sendo só em Financeiro → Acertos).
- Relatório **Vendas por forma de pagamento** (ver ADR 0035): agrupa os pagamentos individuais
  (`Payment.method`/`Payment.amount`) das vendas concluídas no período por forma de pagamento (Pix,
  cartão de crédito/débito, dinheiro, outro) — quantidade de pagamentos, valor total recebido e %
  de participação sobre o total geral. Agrega por PAGAMENTO, não por venda: uma venda com mais de
  um pagamento (split) contribui em cada forma envolvida. Sem restrição de canal (PDV, Salão e
  Delivery participam igualmente) e sem rateio de reembolso por forma de pagamento. Ordenado por
  valor total recebido decrescente.
- Relatório **Vendas por área de entrega** (ver ADR 0036): agrupa os pedidos de delivery concluídos
  (`Sale.channel = DELIVERY`) no período por área de entrega (`DeliveryArea`, ADR 0028) — nome da
  área, quantidade de pedidos, valor total de produtos (subtotal, sem taxa), total de taxas de
  entrega cobradas (`Sale.deliveryFee`) e valor total geral (produtos + taxa). Pedidos sem área
  vinculada aparecem numa linha própria "Sem área definida", nunca descartados. Ordenado por valor
  total geral decrescente.
- Relatório **Itens vendidos** (ver ADR 0037): agrupa os itens (`SaleItem`) das vendas concluídas no
  período por PRODUTO (nome gravado no momento da venda) — posição no ranking, quantidade total
  vendida, receita total (soma bruta de `quantity × unitPrice`, sem descontar reembolso) e preço
  médio praticado (receita total / quantidade). Sem restrição de canal. Ordenado por receita total
  decrescente (ranking dos produtos mais vendidos por faturamento).
- Relatório **Itens consumidos** (ver ADR 0038): diferente de "Itens vendidos" (sobre PRODUTOS finais),
  agrupa o CONSUMO DE ESTOQUE — movimentos `StockMovement`/`LocalStockMovement` do tipo `CONSUMPTION`
  (baixa automática por venda via ficha técnica) por INSUMO (`InventoryItem`) — quantidade total
  consumida no período (soma do valor absoluto, mostrada positiva) e número de movimentações. Não
  inclui `LOSS`/`ADJUSTMENT`/outros tipos, só consumo real por venda. Não é o Relatório de CMV
  (ADR 0026): este é sobre QUANTIDADE de insumo, não sobre custo/dinheiro. Ordenado por quantidade
  consumida decrescente.
- Relatório **DRE Gerencial** (ver ADR 0040): demonstração de resultado simplificada e GERENCIAL
  (não contábil/fiscal — sem impostos nem depreciação) que CRUZA três fontes já existentes: vendas
  concluídas do período (`Sale.total`/`Sale.discount`/`Refund.amount`), o Relatório de CMV (ADR
  0026, `buildCmvReport`) e lançamentos financeiros pagos por categoria (mesma agregação do Fluxo
  de caixa, ADR 0016). Fórmula: Receita bruta − Descontos − Reembolsos = Receita líquida − CMV =
  Lucro bruto − Despesas operacionais + Outras receitas = Resultado do período. Não recalcula
  nenhuma das três fontes, só as consulta e monta a demonstração linha a linha
  (`lib/reports/dre.ts`, `buildDreReport`). Exibida como lista de linhas com subtotais/resultado
  destacados, não como `ReportTable` — ainda com exportação Excel/PDF.
- Relatórios **Tempo de produção** e **Tempo por status** (ver ADR 0039): construídos juntos, sobre a
  mesma fonte — histórico de status de cada pedido de cozinha (`OrderStatusHistory`/
  `LocalOrder.statusHistory`), extração compartilhada em `lib/reports/order-timing.ts`.
- Relatório **Cupons gerados** (ver ADR 0041): construído junto com o cadastro de cupons de
  desconto (`Coupon`/`CouponRedemption`) — ver seção própria acima.
  - **Tempo de produção**: por PEDIDO enviado no período (`Order.sentAt`), tempo entre o envio à
    cozinha e ele ficar pronto (primeira transição para `READY`) — identificador curto, mesa,
    horário de envio, horário de pronto e tempo decorrido. Resumo com tempo médio do período.
    Pedidos que nunca chegaram a `READY` no período (ainda em preparo, ou cancelados antes disso)
    ficam fora das linhas e da média, contados à parte no rodapé ("ainda em andamento/não
    concluídos").
  - **Tempo por status**: agregado do período (não por pedido), tempo médio que os pedidos passam em
    cada status antes de sair dele — Recebido até Em preparo, Em preparo até Pronto, Pronto até
    Entregue — com tempo médio e quantidade de pedidos por status.
- Todos por `establishmentId` da sessão ativa, com rota GET dedicada
  (`/api/admin/reports/sales-by-period`, `/api/admin/reports/revenue-by-day`,
  `/api/admin/reports/staff-performance`, `/api/admin/reports/payment-methods`,
  `/api/admin/reports/sales-by-delivery-area`, `/api/admin/reports/items-sold`,
  `/api/admin/reports/items-consumed`, `/api/admin/reports/production-time`,
  `/api/admin/reports/time-by-status`), suportando modo Prisma (produção) e modo local
  (`lib/local-finance.ts`/`lib/local-inventory.ts`/`lib/local-floor.ts`, a partir do log de
  auditoria/movimentos/histórico de status locais).
- Fora desta fatia (ficam para o futuro, reaproveitando o mesmo framework): cupons gerados, DRE.

## Dashboards — dois dashboards de vendas (ver ADR 0042)

- Módulo NOVO e DIFERENTE de Relatórios: Dashboards é uma tela VISUAL com gráficos
  (`recharts`) para acompanhamento rápido do dia a dia, sem tabela genérica nem exportação
  Excel/PDF — Relatórios continua sendo a tela tabular/exportável para análise/auditoria
  (ver ADR 0033). Item de primeiro nível "Dashboards" na sidebar, visível com qualquer
  permissão `dashboards.*.view`.
- Tela única "Dashboards" (`components/admin/DashboardsWorkspace.tsx`), mesmo espírito de
  navegação do `ReportsWorkspace.tsx` (catálogo central em `lib/dashboards/registry.ts`,
  filtrado por `session.permissionKeys`), mas cada dashboard é um componente próprio com seus
  próprios gráficos.
- Permissão granular por dashboard: `dashboards.sales_tracking.view` e
  `dashboards.multi_store_tracking.view` — ver `docs/AUTORIZACAO.md`.
- Dashboard **Acompanhamento de vendas** (unidade ativa da sessão,
  `components/admin/dashboards/SalesTrackingDashboard.tsx`): cards de KPI (faturamento,
  vendas e ticket médio do dia escolhido — hoje por padrão, com atalho Ontem ou seletor de
  data única, já que dashboard olha para UM dia por vez, diferente do `PeriodFilter` de
  intervalo dos relatórios), gráfico de barras de faturamento por HORA do dia (0h-23h, sempre
  as 24 horas, mesmo sem venda em algumas) e gráfico de pizza de faturamento por CANAL
  (POS/FLOOR/DELIVERY/ONLINE). Rota `GET /api/admin/dashboards/sales-tracking?date=`.
- Dashboard **Acompanhamento de vendas multilojas** (consolida as unidades acessíveis à sessão,
  `components/admin/dashboards/MultiStoreTrackingDashboard.tsx`): KPIs consolidados, gráfico de
  barras comparando faturamento do dia POR UNIDADE (uma unidade sem vendas no dia aparece com
  zero, nunca é omitida do comparativo) e ranking de unidades por faturamento. Rota
  `GET /api/admin/dashboards/multi-store-tracking?date=`. Consolida somente as unidades que a
  PRÓPRIA sessão enxerga (`session.establishments`) — um usuário com acesso a menos de todas
  as unidades da organização nunca vê as demais.
- Cálculo puro e compartilhado (Prisma/local) em `lib/dashboards/sales-tracking.ts`
  (`buildHourlyRevenue`, `buildChannelRevenue`, `buildSalesTrackingKpis`, `buildStoreRevenue`,
  `summarizeMultiStore`), reaproveitando o mesmo `SaleRecord` de `lib/reports/sales.ts` — não
  duplica a lógica de "resumo do dia" já existente em `/api/operations/summary`.
- Biblioteca de gráficos: `recharts` (ver ADR 0042 para a justificativa).

### Dashboards com intervalo de dias (ver ADR 0043)

- Diferente dos dois dashboards acima (sempre UM dia), "Canais" e "Vendas por Data/Hora" usam
  `PeriodFilter` (De/Até + atalhos), mesmo componente já usado pelos relatórios de período.
- Dashboard **Canais** (`components/admin/dashboards/ChannelsDashboard.tsx`): gráfico de barras
  empilhadas com o faturamento por DIA e por canal ao longo do período, cards de KPI por canal
  (faturamento total do período e % de participação) e tabela de ranking de canais por
  faturamento. Cálculo puro em `lib/dashboards/channels.ts` (`buildChannelDailyRevenue`,
  `buildChannelKpis`, `rankChannels`). Rota `GET /api/admin/dashboards/channels?from=&to=`.
- Dashboard **Vendas por Data/Hora** (`components/admin/dashboards/SalesByHourDashboard.tsx`):
  gráfico de barras com o faturamento MÉDIO por hora do dia (0h-23h), calculado sobre todos os dias
  do período — abordagem escolhida no lugar de um heatmap dia da semana × hora, que exigiria um
  componente fora do padrão declarativo do `recharts` (ver ADR 0043, decisão 3). Cálculo puro em
  `lib/dashboards/sales-by-hour.ts` (`buildHourlyAverageRevenue`, `summarizeSalesByHour`), com a
  média calculada sobre a quantidade de dias DISTINTOS observados no período, não sobre a duração
  nominal do intervalo. Rota `GET /api/admin/dashboards/sales-by-hour?from=&to=`.
- Sem `from`/`to` na URL, ambas as rotas caem no mês corrente (`defaultMonthRange`,
  `lib/cashflow.ts`), mesmo fallback já usado pelos relatórios de período.
- Permissões: `dashboards.channels.view` e `dashboards.sales_by_hour.view` — ver
  `docs/AUTORIZACAO.md`.

## Histórico e auditoria — primeira fatia implementada

- Linha do tempo central por organização, respeitando as unidades autorizadas ao usuário.
- Filtros por unidade, tipo de ação e pesquisa por pessoa, entidade, identificador ou motivo.
- Detalhe com responsável, usuário, unidade, data/hora, entidade, IP, motivo e estados anterior/posterior.
- Login, logout, troca de unidade, vendas, cancelamentos, caixa, estoque e cadastros persistentes entram na trilha.
- Venda registra produtos, quantidades, preços, canal, forma de pagamento, mesa e caixa.
- Valores sensíveis como senha, token, cookie, hash e segredo são ocultados na leitura.
- Visualização protegida pela permissão `audit.view`.

Obrigatória para alteração de permissões, cancelamento, desconto, mudança de preço, ajuste de estoque, retirada, fechamento de caixa e toda nova operação persistente. Mesas, comandas e cozinha já alimentam oficialmente a trilha quando o banco persistente está ativo.

## Links públicos do estabelecimento implementados (ADR 0045)

- Configurações → Estabelecimentos exibe, por unidade, botões para copiar o link do cardápio público (`/cardapio/[id]`, só visualização) e do pedido online (`/pedido-online/[id]`, carrinho completo com endereço de entrega).
- Link montado no navegador a partir de `window.location.origin`, sem depender de configuração de domínio.
