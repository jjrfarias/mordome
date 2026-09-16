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
- **Operação implementada:** PDV e salão carregam o catálogo persistido da unidade e a venda realiza a baixa automática transacional da ficha técnica.
- **Grupos de ingrediente implementados (ver ADR 0022):** o dono cadastra, por produto, grupos de opções escolhidas manualmente no momento da venda (ex.: "Molhos" com mínimo/máximo de seleção, "Adicionais" com acréscimo de preço por opção), na própria tela de Cardápio (`catalog.manage`). Diferente da ficha técnica: aqui não há consumo automático de estoque, é uma escolha do cliente/atendente que pode alterar o preço final do item. **Integrado de ponta a ponta nos três canais de venda (PDV, Salão e Delivery)**: ao adicionar um produto com grupo ativo ao carrinho/comanda/pedido, abre um passo de seleção com validação de mínimo/máximo e resumo do preço antes de confirmar; produto sem grupo continua sendo adicionado direto, sem nenhum passo extra. O preço final e a validação são sempre recalculados no servidor. A escolha fica gravada no item correspondente (`TabItem.selectedOptionsSnapshot` na comanda, `DeliveryOrderItem.selectedOptionsSnapshot` no pedido de delivery, `SaleItem.selectedOptionsSnapshot` na venda concluída), no mesmo padrão do retrato de ficha técnica, e aparece de forma legível para a cozinha no KDS do Salão (`FloorManagement.tsx`).

## Delivery — planejado para etapa posterior

- Operação própria e integração com plataformas externas.
- Origem do pedido preservada sem acoplar o catálogo a um marketplace.
- Gestão futura de áreas, taxas, entregadores, despacho, rastreamento e conciliação.
- Nesta primeira etapa, o Cardápio controla apenas disponibilidade e preço no canal delivery.

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

## Relatórios — protótipo parcial

- Vendas, pedidos em andamento, ticket médio, produtos, pagamentos, cancelamentos e descontos.
- Filtros por período, estabelecimento e canal.
- Visão consolidada somente para unidades autorizadas.

## Histórico e auditoria — primeira fatia implementada

- Linha do tempo central por organização, respeitando as unidades autorizadas ao usuário.
- Filtros por unidade, tipo de ação e pesquisa por pessoa, entidade, identificador ou motivo.
- Detalhe com responsável, usuário, unidade, data/hora, entidade, IP, motivo e estados anterior/posterior.
- Login, logout, troca de unidade, vendas, cancelamentos, caixa, estoque e cadastros persistentes entram na trilha.
- Venda registra produtos, quantidades, preços, canal, forma de pagamento, mesa e caixa.
- Valores sensíveis como senha, token, cookie, hash e segredo são ocultados na leitura.
- Visualização protegida pela permissão `audit.view`.

Obrigatória para alteração de permissões, cancelamento, desconto, mudança de preço, ajuste de estoque, retirada, fechamento de caixa e toda nova operação persistente. Mesas, comandas e cozinha já alimentam oficialmente a trilha quando o banco persistente está ativo.
