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

`Product`, `Category`, `ProductVariant`, `ProductOffering`, `IngredientGroup`, `IngredientOption`, `InventoryItem`, `InventoryConversion`, `EstablishmentInventoryItem`, `Recipe`, `RecipeComponent`, `DiningTable`, `Tab`, `TabItem`, `Order`, `OrderItem`, `OrderStatusHistory`, `CashSession`, `CashMovement`, `Sale`, `Payment`, `StockMovement`, `GoodsReceiptNote`, `GoodsReceiptItem`, `PurchaseOrder`, `PurchaseOrderItem`, `ShoppingListItem`, `EstablishmentIntegration`, `PrintTemplate` e `AuditEvent`.

`Product.imageUrl` (opcional, ver ADR 0032): data URL base64 da foto do produto, já comprimida no navegador antes do envio (sem storage de objeto externo nesta fatia).

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
- CMV (Custo de Mercadoria Vendida) é um conceito calculado, não uma entidade persistida: para cada `SaleItem` com ficha técnica, o custo é a soma, por componente, da quantidade consumida × custo médio ponderado do insumo (`soma(quantidade × custoUnitário) / soma(quantidade)` sobre os `StockMovement` do tipo `ENTRY` com custo registrado). Custo médio é sempre "atual" (recalculado a cada consulta a partir de todo o histórico), não histórico por data de venda — ver ADR 0026 para a limitação. Item sem nenhuma entrada com custo é "desconhecido", nunca 0; produto sem ficha técnica fica fora do CMV.
- `PrintTemplate` pertence à unidade (`@@unique([establishmentId])`, um único registro por estabelecimento) e controla apenas a aparência do recibo de venda impresso (cabeçalho, rodapé, exibir documento, largura do papel) — não afeta a lógica de itens/total nem o recibo da cozinha (ver ADR 0031).
- A Simulação de CMV (ver ADR 0027) é o mesmo conceito de custo aplicado a um cenário HIPOTÉTICO em vez de uma venda real: uma lista de componentes simulados (que pode coincidir com uma `Recipe` existente ou ser inventada do zero) + um preço de venda simulado (que pode coincidir com a `ProductOffering` atual ou não) — nada disso é persistido, é só um cálculo efêmero client-side sobre os mesmos custos médios já usados no Relatório de CMV.

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
36. A Lista de compras combina duas fontes sem misturar persistência: sugestões automáticas (item configurado com `minimumStock > 0` e saldo atual abaixo dele) são calculadas em tempo real a cada consulta, nunca persistidas — somem sozinhas quando o saldo volta a subir. Itens manuais (`ShoppingListItem`) são a única parte persistida, com um único campo de ciclo de vida (`resolved: boolean`, default `false`) em vez de um status complexo; viram `resolved: true` ao gerar uma ordem de compra a partir deles ou ao serem marcados manualmente como "já providenciado". "Gerar ordem de compra" a partir da lista nunca duplica a lógica de criação de `PurchaseOrder`: roda a mesma sequência de operações (criar a ordem em `DRAFT`, criar um `PurchaseOrderItem` por item selecionado com `estimatedUnitCost` zerado) já usada pela criação manual de ordem de compra, numa única transação (ADR 0024).
38. `DeliveryArea` é um cadastro por estabelecimento (`@@unique([establishmentId, name])`), nunca por organização — bairros ao redor de uma loja não se repetem entre unidades da mesma rede, ao contrário de `Supplier`. Tem taxa de entrega fixa (`deliveryFee`) e bairros atendidos em texto livre (`neighborhoods`, opcional, sem geolocalização real). Ao criar um pedido de delivery, a área escolhida (opcional) grava um snapshot em `DeliveryOrder.deliveryAreaId`/`deliveryFee` — a referência pode virar `null` se a área for removida do banco diretamente (`onDelete: SetNull`), mas o valor da taxa já cobrada não muda retroativamente. A taxa nunca vira um item de venda: `Sale` ganhou uma coluna própria `deliveryFee` (mesmo padrão de `serviceAmount` do Salão), somada ao `subtotal` para formar o `grossTotal` cobrado, evitando reescrever a resolução de itens contra o catálogo real que a conclusão de venda já faz. Pedido sem área é `deliveryFee = 0` em toda a cadeia, sem exceção (ADR 0028).
40. `CancellationReason` é um cadastro por organização (`@@unique([organizationId, category, label])`), não por estabelecimento — ao contrário de `DeliveryArea`, motivos de cancelamento tendem a se repetir em todas as unidades de uma rede. Cobre três categorias (`CancellationReasonCategory`: `SALE_CANCEL`, `ITEM_CANCEL`, `REFUND`), correspondentes aos três fluxos onde o motivo justifica reverter algo que já existia; caixa e reimpressão não usam esse cadastro por não serem, conceitualmente, cancelamentos. O texto final que chega aos endpoints de cancelamento/reembolso (`reason: string`) nunca referencia o `CancellationReason.id` — é sempre uma cópia do `label` escolhido (ou texto digitado em "Outro"), então inativar ou editar um motivo não altera cancelamentos já registrados (ADR 0029).
41. `WorkShift` (turno de trabalho/escala da equipe, não confundir com `CashSession`, o turno de caixa) é um cadastro por estabelecimento (`@@unique([establishmentId, name])`), mesmo padrão de `DeliveryArea`. `startTime`/`endTime` são strings `HH:mm` e `daysOfWeek` é persistido como string `"0,1,...,6"` (0 = domingo, `Date.getDay()`), serializado como `number[]` em toda a API — decisão de simplicidade, sem tipo `DateTime`/array nativo do Postgres. A atribuição de usuários (`WorkShiftAssignment`) referencia `OrganizationMembership.id`, não `User.id`, mesma unidade de identidade de `EstablishmentAccess`/`MembershipRole`, com `@@unique([workShiftId, membershipId])`; atribuir o mesmo usuário duas vezes ao mesmo turno é idempotente por design (ao contrário da maioria dos cadastros, que rejeita duplicidade com 409). Nenhuma lógica de negócio automática está associada: turnos não bloqueiam operações, não calculam horas trabalhadas e não têm vínculo com folha de pagamento nesta fatia (ADR 0030).
42. O framework de relatórios não cria nenhuma tabela nova: cada relatório é somente leitura sobre dados já existentes (`Sale`/`SaleItem`/`Payment`/`Refund`), agregados sob demanda por `lib/reports/sales.ts` (puro, sem Prisma) a partir de um `SaleRecord` normalizado — a mesma forma sai tanto de uma consulta Prisma quanto do log de auditoria local (`listLocalSalesForReport` em `lib/local-finance.ts`, mesmo rastro usado pelo Fluxo de caixa). "Vendas concluídas no período" exclui vendas `CANCELLED` e vendas totalmente reembolsadas (`refunded >= total`), mas inclui `PARTIALLY_REFUNDED` com o valor líquido já descontado do reembolso. O catálogo de relatórios (`lib/reports/registry.ts`) é a única lista central: cada entrada carrega sua própria `permissionKey` (`reports.<slug>.view`), permitindo permissão fina por relatório individual — ver `docs/AUTORIZACAO.md` (ADR 0033).
43. O relatório "Desempenho por atendente/garçom" (`lib/reports/staff-performance.ts`) agrega o mesmo `SaleRecord` normalizado por pessoa (`Sale.operatorId`) e por papel observado a partir do canal da venda (`POS` = Atendente, `FLOOR` = Garçom; `DELIVERY` fica fora), ordenado por valor líquido total decrescente. É apenas uma visão de desempenho, sem nenhum cálculo de comissão — diferente de `UserCommissionRule`/`SettlementRecord` (regra 31/ADR 0018), que não é lido nem gravado por este relatório. Pessoa sem vendas no período não aparece (ao contrário do acerto, que mostra candidato com valor zero) (ADR 0034).
44. O relatório "Vendas por forma de pagamento" (`lib/reports/payment-methods.ts`) é o único do framework que agrega por PAGAMENTO individual (`Payment.method`/`Payment.amount`), não por venda inteira: `SaleRecord` ganhou um campo opcional `payments: { method, amount }[]` (Prisma via `Payment`, modo local via o array `payments` já gravado no evento `SALE_COMPLETE`), e uma venda com split (mais de um pagamento) contribui em mais de uma linha do relatório. Sem restrição de canal (PDV/Salão/Delivery participam igualmente, ao contrário do relatório de desempenho) e sem rateio de reembolso por forma de pagamento — `Refund` não referencia qual `Payment` foi estornado no modelo atual. Ordenado por valor total recebido decrescente, com participação percentual (`share`) calculada sobre o total geral (ADR 0035).
45. O relatório "Vendas por área de entrega" (`lib/reports/sales-by-delivery-area.ts`) agrega vendas inteiras de `channel = DELIVERY` (uma linha por venda, sem split) por `DeliveryOrder.deliveryAreaId`, usando `Sale.subtotal` (produtos, sem taxa) e `Sale.deliveryFee` (taxa cobrada) já denormalizados na venda (ADR 0028) — não precisa ler `DeliveryOrder.deliveryFee` para o valor, só `deliveryAreaId`/`DeliveryArea.name` para saber a área. `SaleRecord` ganhou os campos opcionais `deliveryAreaId`/`deliveryAreaName`/`deliveryFee` (Prisma via `include: { deliveryOrder: { include: { deliveryArea: true } } }`, modo local via o evento `SALE_COMPLETE` estendido para gravar esse snapshot). Pedidos sem área vinculada não são descartados: caem na linha `"Sem área definida"`, participando normalmente do total geral e da ordenação (por valor total geral decrescente) (ADR 0036).
46. O relatório "Itens vendidos" (`lib/reports/items-sold.ts`) é o único do framework que agrega por ITEM DE VENDA (`SaleItem`), não por venda inteira: `SaleRecord` ganhou um campo opcional `items: { productName, quantity, unitPrice }[]` (Prisma via `include: { items: true }`, modo local via o array `items` já gravado no evento `SALE_COMPLETE` para todo canal). Agrupa por `productName` (snapshot no momento da venda, sem join com `Product`), somando quantidade e receita bruta (`quantity × unitPrice`, sem descontar reembolso — mesma simplificação dos ADRs 0035/0036) por produto. "Preço médio" é a receita total dividida pela quantidade total (média ponderada, não média simples de preços distintos). Ordenado por receita total decrescente, com a posição no ranking (`rank`) calculada a partir dessa ordenação, não persistida (ADR 0037).
39. O Histórico de posição de estoque é somente leitura sobre `StockMovement` já existente — não é uma tabela nova nem um novo conceito de saldo. Para um item e período dados, o saldo de abertura é a soma de `quantity` de todos os movimentos com `createdAt` anterior ao "de"; o saldo acumulado de cada movimento do período é calculado incrementalmente a partir dali, na mesma ordem cronológica em que os movimentos ocorreram. O mesmo cálculo existe em dois lugares por necessidade de runtime (servidor Prisma via agregação SQL/JS na rota; modo local via `getLocalStockPositionHistory` em `lib/local-inventory.ts`), mas segue a mesma fórmula em ambos. Para sustentar isso, o modo local passou a guardar cada movimento como um registro completo (`{ id, type, quantity, reason, sourceType, createdAt }`) em vez de um número solto — mudança aditiva, sem efeito em nenhuma regra de saldo/transferência/consumo já existente (ADR 0025).

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
