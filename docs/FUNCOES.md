# Catálogo funcional

## Organização e estabelecimentos — parcialmente implementado

- Criar e editar dados da organização.
- Criar múltiplos estabelecimentos por organização.
- Definir nome, CNPJ opcional, telefone, endereço, horário e taxa de serviço por unidade.
- Selecionar a unidade ativa em componente persistente. **Implementado:** o seletor exibe somente acessos da associação, persiste a escolha na sessão e rejeita IDs não autorizados.
- Consolidar indicadores das unidades permitidas ao usuário.
- Impedir qualquer leitura ou escrita em unidade não autorizada.

No protótipo local, o estado operacional também é armazenado sob uma chave específica por estabelecimento para não misturar vendas e comandas durante a troca. Cadastro, edição e desativação de unidades ainda serão implementados na área administrativa.

## Usuários e acesso — decidido

- Convidar e desativar usuários.
- Criar perfis personalizados por organização.
- Associar um ou vários perfis ao usuário conforme regra a detalhar.
- Limitar o usuário a estabelecimentos específicos.
- Conceder ou bloquear permissões individuais como exceção.
- Exibir ao administrador a permissão efetiva e sua origem.
- Auditar alterações de acesso.

## PDV rápido — protótipo implementado

- Pesquisar e filtrar produtos pré-cadastrados.
- Adicionar, incrementar, reduzir e remover itens.
- Selecionar forma de pagamento.
- Finalizar venda sem mesa ou comanda.
- Registrar a origem `PDV` no resumo.

Planejado: desconto autorizado, identificação de cliente, pagamento dividido, impressão e vínculo obrigatório a uma sessão de caixa aberta.

## Salão e comandas — protótipo parcial

- Visualizar e filtrar mesas.
- Abrir comanda ao adicionar o primeiro produto.
- Adicionar, alterar e remover itens.
- Enviar pedido para cozinha.
- Fechar conta e liberar mesa.

Planejado: reservas, cliente opcional, observações, complementos, transferência e união de mesas, divisão por pessoa/item/valor, cancelamento justificado e desconto autorizado.

## Cozinha — protótipo implementado

- Listar pedidos enviados pelo salão.
- Avançar entre recebido, em preparo, pronto e entregue.
- Organizar por tempo e destacar atraso.

Planejado: atualização em tempo real, estações de preparo, reimpressão e histórico de status.

## Produtos e cardápio — dados demonstrativos

> Decisão pendente: não implementar cadastro ou gestão de produtos antes de alinhar catálogo, variações, complementos, preços por unidade e vínculo com estoque.

- Categorias, nome, descrição, preço, disponibilidade, variações, complementos e pesquisa.
- Disponibilidade e preço podem variar por estabelecimento.
- Um catálogo poderá ser compartilhado na organização, preservando configurações por unidade.

## Caixa — planejado

- Abertura e fechamento por estabelecimento e operador.
- Entradas, retiradas/sangrias e justificativas.
- Formas de pagamento e pagamento dividido.
- Resumo e divergência do turno.
- Venda só pode ser finalizada conforme política de caixa da unidade.

## Estoque — planejado

- Insumo ou produto controlado por unidade.
- Quantidade, unidade de medida e estoque mínimo.
- Entrada, saída e ajuste com motivo e ator.
- Alertas de estoque baixo.

## Relatórios — protótipo parcial

- Vendas, pedidos em andamento, ticket médio, produtos, pagamentos, cancelamentos e descontos.
- Filtros por período, estabelecimento e canal.
- Visão consolidada somente para unidades autorizadas.

## Auditoria — decidido

Obrigatória para alteração de permissões, cancelamento, desconto, mudança de preço, ajuste de estoque, retirada, fechamento de caixa e demais ações definidas como sensíveis.
