# Modelo de domínio

## Núcleo de identidade e tenancy

| Entidade | Responsabilidade |
| --- | --- |
| `User` | Identidade global de uma pessoa |
| `Session` | Sessão revogável; persiste somente o hash do token |
| `Organization` | Cliente contratante e limite principal de dados |
| `OrganizationMembership` | Vínculo do usuário com a organização |
| `Establishment` | Unidade operacional |
| `EstablishmentAccess` | Unidades que uma associação pode acessar |
| `CustomRole` | Perfil reutilizável criado pela organização |
| `Permission` | Capacidade atômica conhecida pelo sistema |
| `RolePermission` | Permissões incluídas no perfil |
| `UserPermissionOverride` | Concessão ou bloqueio individual |

## Operação

`Product`, `Category`, `ProductVariant`, `ModifierGroup`, `Table`, `Tab`, `TabItem`, `Order`, `OrderItem`, `OrderStatusHistory`, `CashSession`, `CashMovement`, `Sale`, `Payment`, `StockItem`, `StockMovement` e `AuditEvent`.

## Relações principais

- Uma organização possui muitas unidades, associações e perfis.
- Uma associação possui acessos a unidades e exceções de permissão.
- Uma mesa pertence a uma unidade e pode ter no máximo uma comanda ativa.
- Uma comanda pertence a uma unidade e origina um ou mais pedidos.
- Uma venda pertence à unidade e ao caixa; pode ter vários pagamentos.
- Estoque e preço efetivo pertencem à unidade, mesmo quando o produto é compartilhado.

## Invariantes

1. Não relacionar registros de organizações ou estabelecimentos diferentes.
2. Não finalizar venda com total negativo ou sem itens, salvo caso de uso específico auditado.
3. Não alterar comanda fechada; correções ocorrem por estorno/cancelamento.
4. Não fechar caixa já fechado.
5. Desconto, cancelamento e ajuste exigem permissão; justificativa pode ser obrigatória por política.
6. Todo valor monetário possui moeda BRL no MVP e precisão determinística.
7. Histórico de status e auditoria não são sobrescritos.
8. `username` é único globalmente, normalizado em minúsculas e não depende de e-mail.
9. A configuração inicial só é permitida quando ainda não existe usuário.

## Estados

- Mesa: `FREE`, `OCCUPIED`, `RESERVED`, `AWAITING_CLOSE`.
- Comanda: `OPEN`, `AWAITING_PAYMENT`, `PAID`, `CANCELLED`.
- Pedido: `RECEIVED`, `CONFIRMED`, `PREPARING`, `READY`, `DELIVERED`, `CANCELLED`.
- Caixa: `OPEN`, `CLOSED`.

## Eventos relevantes

`TabOpened`, `ItemAdded`, `ItemCancelled`, `OrderSent`, `OrderStatusChanged`, `DiscountApplied`, `PaymentRegistered`, `SaleClosed`, `CashOpened`, `CashWithdrawalRecorded`, `CashClosed`, `PermissionChanged` e `StockAdjusted`.

## Questões ainda abertas

- Um usuário poderá acumular vários perfis ou terá um perfil base por unidade?
- Produtos compartilhados serão copiados ou referenciados por catálogo organizacional?
- A taxa de serviço integra receita do estabelecimento ou é demonstrada separadamente?
- Política de funcionamento sem caixa aberto.

Questões abertas devem virar ADR quando decididas.
