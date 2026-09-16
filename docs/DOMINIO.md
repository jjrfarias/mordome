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

`Product`, `Category`, `ProductVariant`, `ProductOffering`, `IngredientGroup`, `IngredientOption`, `InventoryItem`, `InventoryConversion`, `EstablishmentInventoryItem`, `Recipe`, `RecipeComponent`, `DiningTable`, `Tab`, `TabItem`, `Order`, `OrderItem`, `OrderStatusHistory`, `CashSession`, `CashMovement`, `Sale`, `Payment`, `StockMovement`, `GoodsReceiptNote`, `GoodsReceiptItem`, `PurchaseOrder`, `PurchaseOrderItem` e `AuditEvent`.

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
- Grupo de ingrediente pertence a um produto (não é reutilizável entre produtos nesta fatia, ver ADR 0022) e agrupa opções escolhidas manualmente pelo cliente/atendente no momento da venda, nos três canais (PDV, Salão e Delivery) — diferente da ficha técnica, que é consumo automático e sem escolha. A opção pode somar um `priceDelta` (sempre ≥ 0 nesta fatia) ao preço unitário do item vendido. `SaleItem`/`TabItem`/`DeliveryOrderItem` guardam um retrato (`selectedOptionsSnapshot`) das opções escolhidas, no mesmo padrão de `recipeSnapshot`.
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
31. Não existem tabelas separadas para "entregador" e "garçom": ambos são `User` comuns, identificados por papel observacional no período — entregador é quem aparece em `DeliveryOrder.courierId` com `status = DELIVERED`; garçom é quem aparece em `Sale.operatorId` com `channel = FLOOR` e status concluído/parcialmente reembolsado. `UserCommissionRule` guarda no máximo uma regra por usuário/papel/estabelecimento (`@@unique([establishmentId, userId, role])`), com valor fixo por entrega OU percentual sobre vendas, nunca os dois. Um usuário sem regra ainda aparece no acerto do período, com valor calculado zero, para não esconder que ele teve movimento. `SettlementRecord` é imutável após criado (sem edição/estorno) e bloqueia apenas duplicidade exata de usuário/papel/`from`/`to` — períodos parcialmente sobrepostos não são detectados (ADR 0018).
32. Conciliação bancária considera apenas `FinancialEntry` com `bankAccountId` preenchido e `status = PAID` — nunca `Sale` nem `CashMovement`, que não carregam vínculo com uma conta bancária específica; isso a diferencia do Fluxo de caixa (regra 29), que soma as três fontes. `reconciled`/`reconciledAt`/`reconciledById` vivem no próprio `FinancialEntry` (sem tabela própria de "movimento bancário"); marcar/desmarcar é sempre reversível e não tem histórico de versões além do `AuditEvent` de auditoria geral (ADR 0019).
33. Uma nota de entrada (`GoodsReceiptNote`) é uma camada de agrupamento/documentação sobre `StockMovement`, não uma fonte de saldo própria: `GoodsReceiptItem.inventoryItemId` referencia um `EstablishmentInventoryItem` já configurado na unidade (mesmo requisito da entrada manual de estoque). Em `DRAFT`, itens e cabeçalho podem ser livremente editados/removidos; ao confirmar, a transação cria um `StockMovement` tipo `ENTRY` por item, vincula `GoodsReceiptItem.stockMovementId` e muda `status` para `CONFIRMED`, travando a nota para edição — não existe reabertura/estorno formal de nota confirmada nesta fatia, apenas os ajustes de estoque já existentes. Confirmar exige ao menos um item e é idempotente (uma nota já `CONFIRMED` rejeita nova confirmação) (ADR 0020).
34. Uma ordem de compra (`PurchaseOrder`) nunca move estoque diretamente — ela é puro planejamento/intenção de compra, com estados `DRAFT` → `SENT` → `RECEIVED` e `CANCELLED` alcançável a partir de `DRAFT` ou `SENT` (nunca de `RECEIVED`). `PurchaseOrderItem.inventoryItemId` referencia um `EstablishmentInventoryItem` já configurado na unidade, mesmo requisito de `GoodsReceiptItem`. Itens e cabeçalho só podem ser editados em `DRAFT`. A única ação que dá efeito real no estoque é "gerar nota de entrada" (disponível em `DRAFT` e `SENT`), que numa transação atômica cria uma `GoodsReceiptNote` nova em `DRAFT` com um `GoodsReceiptItem` por item da ordem (custo estimado da ordem vira custo inicial da nota) e marca a ordem como `RECEIVED`, gravando `generatedNoteId`; gerar a nota de uma ordem já `RECEIVED`, `CANCELLED` ou vazia é rejeitado (ADR 0021).
35. Contagem de estoque em lote (`BULK_PHYSICAL_COUNT`, mesma rota de ajuste individual) reaproveita a fórmula única `resolvePhysicalCountAdjustment` (`lib/inventory-domain.ts`), a mesma usada pelo ajuste individual `ADJUST`/`PHYSICAL_COUNT` — nenhum `StockMovementType` novo foi criado, ambos geram `ADJUSTMENT` com `sourceType: "PHYSICAL_COUNT"`. Uma contagem física nunca pode gerar saldo negativo por definição (o novo saldo é sempre a própria quantidade contada, sempre ≥ 0), então a validação `allowNegative` nunca é violada por esse tipo de ajuste — a checagem existe apenas por robustez/paridade com os outros tipos de ajuste. A ação em lote roda em `db.$transaction`: se qualquer item falhar (não encontrado, por exemplo), nenhum ajuste da sessão é persistido, e cada item ajustado gera seu próprio `StockMovement`/`AuditEvent`, nunca um evento agregado. O motivo é único por sessão (não por item) — simplificação deliberada (ADR 0023). Histórico de posições de estoque ao longo do tempo (comparar contagens passadas) está fora de escopo desta fatia.

## Estados

- Mesa: `FREE`, `OCCUPIED`, `RESERVED`, `AWAITING_CLOSE`.
- Comanda: `OPEN`, `AWAITING_PAYMENT`, `PAID`, `CANCELLED`.
- Pedido: `RECEIVED`, `CONFIRMED`, `PREPARING`, `READY`, `DELIVERED`, `CANCELLED`.
- Caixa: `OPEN`, `CLOSED`.
- Lançamento financeiro: `PENDING`, `PAID`.

## Eventos relevantes

`TabOpened`, `ItemAdded`, `ItemCancelled`, `OrderSent`, `OrderStatusChanged`, `DiscountApplied`, `PaymentRegistered`, `SaleClosed`, `CashOpened`, `CashWithdrawalRecorded`, `CashClosed`, `PermissionChanged`, `StockAdjusted`, `StockTransferred`, `FinancialEntryCreated`, `FinancialEntryStatusChanged` e `SettlementRecordCreated`.

## Questões ainda abertas

- Um usuário acumula vários perfis da organização; o acesso às unidades é definido separadamente e as permissões ativas são somadas.
- A taxa de serviço integra receita do estabelecimento ou é demonstrada separadamente?
- Se uma política futura poderá autorizar excepcionalmente uma operação sem caixa e quais permissões e auditoria serão exigidas.

Questões abertas devem virar ADR quando decididas.
