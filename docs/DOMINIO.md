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

`Product`, `Category`, `ProductVariant`, `ProductOffering`, `InventoryItem`, `InventoryConversion`, `EstablishmentInventoryItem`, `Recipe`, `RecipeComponent`, `DiningTable`, `Tab`, `TabItem`, `Order`, `OrderItem`, `OrderStatusHistory`, `CashSession`, `CashMovement`, `Sale`, `Payment`, `StockMovement` e `AuditEvent`.

## Relações principais

- Uma organização possui muitas unidades, associações e perfis.
- Uma associação possui acessos a unidades e exceções de permissão.
- Uma mesa pertence a uma unidade e pode ter no máximo uma comanda ativa.
- Uma comanda pertence a uma unidade e origina um ou mais pedidos.
- Um cancelamento de item pertence ao item da rodada original, preservando quantidade, motivo, ator e horário.
- Uma venda pertence à unidade e ao caixa; pode ter vários pagamentos.
- Estoque e preço efetivo pertencem à unidade, mesmo quando o produto é compartilhado.
- Produto e categoria pertencem à organização; `ProductOffering` define preço, disponibilidade e canal por estabelecimento.
- Item de estoque pertence à organização; política, saldo e movimentos pertencem ao estabelecimento.
- Receita de venda pertence à unidade e liga uma variante aos itens consumidos. Receita de pré-preparo transforma componentes em outro item de estoque com rendimento definido.
- Transferência de estoque gera sempre dois movimentos atômicos: `TRANSFER_OUT` na origem e `TRANSFER_IN` no destino.
- Categoria financeira pertence à organização e é compartilhada entre suas unidades; conta bancária e forma de pagamento configurável pertencem ao estabelecimento.
- Lançamento financeiro pertence ao estabelecimento (e referencia a organização), a uma categoria financeira obrigatória e, opcionalmente, a uma conta bancária e a uma forma de pagamento configurada.

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
10. Quantidades de estoque são persistidas na unidade-base (`g`, `ml` ou `un`) com precisão decimal.
11. Venda e consumo automático compartilham transação e chave idempotente.
12. Movimentos de estoque não são editados ou apagados; correções geram movimento inverso.
13. Transferências só podem ocorrer entre unidades da mesma organização às quais o operador possui acesso e não podem exceder o saldo físico da origem.
14. Preço, produto e receita recebidos do navegador nunca são confiáveis: a venda recalcula oferta e composição no servidor.
15. Cada venda possui chave idempotente; venda, itens, pagamento e consumos são confirmados ou revertidos juntos.
16. Existe no máximo um caixa aberto por operador e estabelecimento.
17. Item enviado nunca é apagado: cancelamento gera registro imutável e reduz a quantidade faturável da comanda.
18. Venda concluída só pode ser cancelada enquanto o caixa original estiver aberto; depois disso, exige reembolso.
17. Uma nova venda pertence ao caixa aberto pelo mesmo operador na unidade ativa.
18. Suprimentos e sangrias são imutáveis e idempotentes; correções exigem um novo movimento auditado.
19. O fechamento preserva valores esperados, valores contados por forma de pagamento e a diferença, sem reescrever vendas históricas.
20. Toda mutação persistente relevante gera `AuditEvent` na mesma transação da operação.
21. Eventos de auditoria não são editados ou excluídos pela aplicação e nunca expõem credenciais ou segredos.
22. A leitura do histórico respeita organização, unidades autorizadas e a permissão `audit.view`.
23. Uma mesa possui no máximo uma comanda `OPEN`; o primeiro item abre a comanda.
24. Itens enviados à cozinha não são apagados silenciosamente e cada rodada preserva seu snapshot.
25. Mudanças de status de pedido seguem a sequência permitida e preservam ator/data em `OrderStatusHistory`.
26. O fechamento de uma comanda e seu vínculo à venda acontecem na mesma transação.
27. Categoria financeira não pode ser excluída, apenas inativada, quando já existir lançamento vinculado a ela; o tipo receita/despesa do lançamento é sempre o da categoria escolhida, não um campo independente.
28. Lançamento financeiro marcado como pago recebe `paidAt`; revertido para pendente, `paidAt` volta a nulo.
29. O fluxo de caixa é sempre calculado em regime de caixa (data de realização: `paidAt` do lançamento ou `completedAt` da venda), nunca em regime de competência (`dueDate`); é uma leitura agregada sem persistência própria, recalculada a cada consulta por período e estabelecimento.
30. Fornecedor é escopado por organização (não por estabelecimento): uma rede compra do mesmo fornecedor em várias lojas, e o cadastro é compartilhado entre as unidades da mesma organização, como já ocorre com `FinancialCategory`. Um lançamento financeiro pode opcionalmente referenciar um fornecedor (`FinancialEntry.supplierId`); a exclusão do fornecedor não é permitida, apenas inativação, e a relação usa `onDelete: SetNull` para nunca bloquear ou apagar lançamentos já vinculados.

## Estados

- Mesa: `FREE`, `OCCUPIED`, `RESERVED`, `AWAITING_CLOSE`.
- Comanda: `OPEN`, `AWAITING_PAYMENT`, `PAID`, `CANCELLED`.
- Pedido: `RECEIVED`, `CONFIRMED`, `PREPARING`, `READY`, `DELIVERED`, `CANCELLED`.
- Caixa: `OPEN`, `CLOSED`.
- Lançamento financeiro: `PENDING`, `PAID`.

## Eventos relevantes

`TabOpened`, `ItemAdded`, `ItemCancelled`, `OrderSent`, `OrderStatusChanged`, `DiscountApplied`, `PaymentRegistered`, `SaleClosed`, `CashOpened`, `CashWithdrawalRecorded`, `CashClosed`, `PermissionChanged`, `StockAdjusted`, `StockTransferred`, `FinancialEntryCreated` e `FinancialEntryStatusChanged`.

## Questões ainda abertas

- Um usuário acumula vários perfis da organização; o acesso às unidades é definido separadamente e as permissões ativas são somadas.
- A taxa de serviço integra receita do estabelecimento ou é demonstrada separadamente?
- Se uma política futura poderá autorizar excepcionalmente uma operação sem caixa e quais permissões e auditoria serão exigidas.

Questões abertas devem virar ADR quando decididas.
