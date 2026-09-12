# Autorização e perfis personalizados

## Modelo decidido

O Mordomê usa RBAC com escopo e exceções individuais. Perfis fixos podem existir como modelos iniciais, mas a organização pode criar perfis próprios.

```text
permissões dos perfis
+ concessões individuais
- bloqueios individuais
= permissões efetivas dentro das unidades autorizadas
```

Um atendente pode, por exemplo, receber apenas `finance.reports.view` para ajudar no financeiro sem obter fechamento de caixa, retiradas ou administração.

## Escopos

- **Organização:** configurações globais, usuários, perfis e consolidado.
- **Estabelecimento:** operação, caixa, estoque e relatórios da unidade.
- **Próprio:** ações limitadas aos registros criados/atribuídos ao usuário, quando aplicável.

## Catálogo inicial

| Módulo | Exemplos de permissões |
| --- | --- |
| Organização | `organization.view`, `organization.update`, `establishment.manage` |
| Pessoas | `users.view`, `users.invite`, `users.disable`, `roles.manage` |
| Salão | `floor.view`, `tabs.open`, `tabs.update`, `tabs.transfer`, `tabs.merge` |
| Pedidos | `orders.create`, `orders.update`, `orders.cancel` |
| Descontos | `discounts.apply`, `discounts.apply_above_limit` |
| PDV | `pos.sell`, `pos.cancel_sale` |
| Caixa | `cash.open`, `cash.move`, `cash.close`, `cash.history.view` |
| Financeiro | `finance.summary.view`, `finance.reports.view`, `finance.export` |
| Produtos | `catalog.view`, `catalog.manage`, `prices.manage`, `availability.manage` |
| Estoque | `stock.view`, `stock.move`, `stock.adjust` |
| Auditoria | `audit.view` |

Os nomes são contratos internos e só devem mudar por migração explícita.

## Perfis modelo

Administrador, gerente, atendente, caixa e cozinha são modelos clonáveis, não regras rígidas. O proprietário pode criar “Atendente + resumo financeiro” selecionando capacidades específicas.

## Avaliação no servidor

1. Validar sessão e associação ativa.
2. Validar se o estabelecimento pertence à organização.
3. Confirmar `EstablishmentAccess`.
4. Carregar permissões dos perfis ativos.
5. Aplicar concessões e bloqueios individuais; bloqueio prevalece.
6. Avaliar condições adicionais, como limite de desconto.
7. Autorizar ou negar sem revelar dados do recurso.

## Proteções

- Interface oculta ou desabilita ações, mas nunca substitui a verificação do servidor.
- Alterações de perfis e exceções geram `AuditEvent` com antes/depois.
- Ninguém pode remover a última administração capaz de recuperar a organização.
- Usuário não pode conceder permissão que não possui, salvo papel proprietário definido.
- Cache de permissões deve ser invalidado imediatamente após alteração.

## Matriz por usuário

A tela administrativa deve mostrar: usuário, organizações, unidades permitidas, perfis, concessões, bloqueios e resultado efetivo. A explicação “permitido por / bloqueado por” é requisito de suporte e auditoria.
