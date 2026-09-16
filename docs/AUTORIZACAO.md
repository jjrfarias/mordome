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
| Pessoas | `users.view`, `users.invite`, `users.disable`, `users.password.reset`, `roles.manage` |
| Salão | `floor.view`, `tabs.open`, `tabs.update`, `tabs.cancel_item`, `tabs.transfer`, `tabs.merge` |
| Pedidos | `orders.create`, `orders.update`, `orders.cancel` |
| Descontos | `discounts.apply`, `discounts.apply_above_limit` |
| PDV | `pos.sell`, `pos.cancel_sale` |
| Operação do salão | `floor.operate` |
| Caixa | `cash.open`, `cash.move`, `cash.close`, `cash.history.view` |
| Histórico | `audit.view` |
| Financeiro | `finance.summary.view`, `finance.reports.view`, `finance.export`, `finance.manage`, `finance.entries.manage` |
| Produtos | `catalog.view`, `catalog.manage`, `prices.manage`, `availability.manage` |
| Estoque | `stock.view`, `stock.move`, `stock.adjust` |
| Auditoria | `audit.view` |

Os nomes são contratos internos e só devem mudar por migração explícita.

## Permissão por relatório individual (ADR 0033)

Os relatórios (`lib/reports/registry.ts`) introduzem uma granularidade nova: em vez de uma
permissão única "ver relatórios", **cada relatório do catálogo tem sua própria chave** de
permissão, no padrão `reports.<slug>.view` (ex. `reports.sales_by_period.view`,
`reports.revenue_by_day.view`, `reports.performance_by_staff.view`,
`reports.payment_methods.view`, `reports.sales_by_delivery_area.view`,
`reports.items_sold.view`, `reports.items_consumed.view`, `reports.production_time.view`,
`reports.time_by_status.view`, `reports.dre.view`, `reports.coupons_generated.view`). Isso permite
que um perfil enxergue "Vendas por período" sem ter acesso a "Faturamento por dia", "Desempenho por
atendente/garçom", "Vendas por forma de pagamento", "Vendas por área de entrega", "Itens vendidos",
"Itens consumidos", "Tempo de produção", "Tempo por status", "DRE Gerencial" ou "Cupons gerados", e
vice-versa — decisão de produto explícita do dono.

A tela única de relatórios (`components/admin/ReportsWorkspace.tsx`) não usa nenhuma flag booleana
dedicada na sessão para isso: ela filtra o catálogo central diretamente pelo array
`session.permissionKeys` (já existente e já propagado por `getCurrentSession`/`getLocalSession`),
via `listAvailableReports(permissionKeys)`. Cada rota de API de um relatório (ex.
`GET /api/admin/reports/sales-by-period`) valida `session.permissionKeys.includes(<chave do
relatório>)` antes de responder — a interface some com o item que falta permissão, mas o servidor
sempre repete a verificação.

Para adicionar um relatório novo no futuro: criar sua constante de permissão em
`lib/permissions.ts` seguindo o padrão `reports.<slug>.view`, gerar a migração inserindo a
`Permission` e concedendo aos perfis `systemTemplate = true` (mesmo padrão das migrações 0015/0016/
0018), e registrar o relatório em `lib/reports/registry.ts`. Nenhuma outra peça do framework
(navegação, exportação, tabela) precisa mudar.

## Perfis modelo

Administrador, gerente, atendente, caixa e cozinha são modelos clonáveis, não regras rígidas. O proprietário pode criar “Atendente + resumo financeiro” selecionando capacidades específicas.

O perfil de sistema **Proprietário** é criado no primeiro acesso e recebe as permissões administrativas e operacionais, incluindo `establishments.manage`, `pos.sell` e `floor.operate`. A API repete as verificações; ocultar o menu não é considerado autorização.

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
