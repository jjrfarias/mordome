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

## Financeiro — núcleo básico implementado

- Categorias financeiras por organização, com tipo receita ou despesa (`finance.manage`).
- Contas bancárias cadastráveis por estabelecimento (banco, agência, conta e saldo inicial), sem cálculo de saldo corrente ainda (`finance.manage`).
- Formas/métodos de pagamento configuráveis por estabelecimento (nome, tipo, taxa e prazo de repasse), distintos do meio de pagamento usado no PDV (`finance.manage`).
- Lançamentos financeiros manuais (contas a pagar e a receber), com categoria, conta bancária e forma de pagamento opcionais, vencimento, status pendente/pago e observações (`finance.entries.manage`).
- **Fluxo de caixa (implementado):** tela consolidada por período (padrão: mês corrente, com atalhos "Hoje"/"Esta semana"/"Este mês" e seleção livre de data "de"/"até"), somando em regime de caixa: lançamentos financeiros com status pago (`paidAt` no período, entrada se a categoria é receita e saída se é despesa) e vendas concluídas do PDV/salão/delivery (`Sale.total` no período, sempre como entrada) e movimentações manuais de caixa (`CashMovement`: suprimento como entrada, retirada como saída). Mostra total de entradas, total de saídas, saldo do período e saldo acumulado (soma do `BankAccount.initialBalance` de todas as contas do estabelecimento mais o saldo do período, sem reconciliar por conta individual) e a lista cronológica dos lançamentos que compõem o total. Somente leitura, permissão `finance.cashflow.view`. Ver ADR 0016 para as decisões de modelagem e limitações assumidas.
- **Fornecedores (implementado):** cadastro básico por organização (nome/razão social, nome fantasia, documento CNPJ/CPF opcional validado apenas por tamanho, telefone/WhatsApp, e-mail, observações, ativo/inativo), sem exclusão — apenas inativação, permissão `finance.manage`. Pode ser vinculado opcionalmente a um lançamento financeiro (`FinancialEntry.supplierId`) na tela de Lançamentos, para registrar "quem foi pago". É um cadastro compartilhado que também será usado futuramente por Notas de entrada/Ordem de compra em Estoque. Ver ADR 0017.
- Ver ADR 0015 para as decisões do núcleo básico. Acertos de entregadores/garçons, ordem de compra/notas de entrada e conciliação bancária por conta permanecem fora deste escopo.

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
