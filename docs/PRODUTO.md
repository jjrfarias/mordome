# Produto

## Identidade

- Produto: **Mordomê**
- Slogan: **Tudo sob controle.**
- Assinatura institucional: **by JCS**
- Posicionamento: gestão simples e acolhedora para operações de alimentação, sem aparência de sistema antigo ou painel corporativo genérico.

## Público

Bares, lanchonetes, restaurantes pequenos e médios, hamburguerias, pizzarias e cafeterias com atendimento presencial, balcão, retirada ou delivery próprio.

## Problema

Operações pequenas e médias costumam distribuir mesas, pedidos, cozinha, produtos, caixa e estoque entre papel, memória e ferramentas desconectadas. O Mordomê centraliza o turno sem acrescentar burocracia.

## Princípios

1. A operação atual deve estar compreensível em poucos segundos.
2. Ações frequentes exigem poucos toques e funcionam em celular, tablet e computador.
3. O sistema deve impedir acesso entre organizações e unidades não autorizadas.
4. Operações sensíveis devem identificar ator, unidade, instante e justificativa.
5. O produto deve funcionar por unidade e também oferecer visão consolidada da organização.

## Estrutura comercial decidida

Um cliente é representado por uma **Organização**. Uma organização possui um ou vários **Estabelecimentos**. Usuários podem participar de organizações e receber acesso a uma ou várias unidades.

No fluxo SaaS definitivo, a compra da licença provisiona a organização e envia ao e-mail cadastrado um convite temporário de ativação. O proprietário cria usuário e senha por esse convite; o login cotidiano não utiliza e-mail. A automação desse fluxo foi adiada conforme o ADR 0004.

## MVP

- Autenticação e recuperação de acesso.
- Organização e múltiplos estabelecimentos.
- Usuários, perfis personalizados e permissões granulares.
- PDV rápido.
- Salão, mesas, comandas e pedidos.
- KDS de cozinha.
- Produtos, categorias e disponibilidade.
- Caixa por turno e formas de pagamento.
- Estoque básico.
- Resumo diário e relatórios básicos.
- Auditoria de ações sensíveis.

## Fora do MVP

Integração fiscal, TEF, gateway de pagamento, ficha técnica avançada, baixa automática complexa de insumos e marketplaces de delivery.

## Estado atual

Existe um protótipo funcional publicado com autenticação real por usuário e senha, sessão segura, organização e primeira unidade persistidas no PostgreSQL. PDV, salão, comanda, cozinha, fechamento e resumo ainda usam `localStorage`; esses módulos ainda não possuem persistência multiusuário nem autorização completa no servidor.
