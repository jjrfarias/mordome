# ADR 0028: Áreas de entrega

- Estado: aceito
- Data: 2026-09-16

## Contexto

O Delivery (ver `app/api/operations/delivery/route.ts` e `components/operations/DeliveryManagement.tsx`) já opera com endereço em texto livre e ponto opcional no mapa (`destinationLat`/`destinationLng`), sem qualquer noção de zona/bairro com taxa fixa. Hoje, se o estabelecimento cobra uma taxa de entrega diferente por bairro (ex.: Parque Aeroporto, Cavaleiros, Costa Azul — bairros reais do cliente Betão Hot Dog, ver `docs/clientes/BETAO.md`), o atendente precisa negociar/lembrar a taxa manualmente e somá-la "por fora" do sistema, sem rastro no pedido nem na venda gerada. Esta fatia entrega um cadastro simples de áreas de entrega por estabelecimento, com taxa fixa, e integra a escolha (opcional) dessa área ao fluxo já existente de criação de pedido de delivery.

Fora de escopo (explicitamente): geolocalização real (raio/polígono no mapa, roteirização por zona), Motivos de cancelamento, Turnos e Modelos de impressão — todos fora do pedido desta fatia.

## Decisões

1. **"Bairros atendidos" como texto livre, não geolocalização real.** `DeliveryArea.neighborhoods` é uma `String?` opcional de texto livre (ex.: "Parque Aeroporto, Jardim Atlântico"), sem qualquer validação estruturada, raio ou polígono. Geolocalização real (desenhar a área num mapa, calcular automaticamente em qual área um endereço cai) é uma fatia futura muito mais cara — o ADR 0014 (roteirização OSRM) já registra que a integração de mapas é tratada com cautela nesta base. Nesta fatia, a escolha da área é sempre manual pelo atendente, no mesmo espírito do endereço em texto livre já usado no Delivery hoje.

2. **Escopo por estabelecimento, não por organização.** Diferente de `Supplier`/`FinancialCategory` (escopados por organização, pois fornecedores tendem a se repetir entre lojas de uma rede), áreas de entrega são fisicamente amarradas a uma unidade específica (bairros ao redor de uma loja não fazem sentido para outra loja da mesma rede, ainda que futura). `DeliveryArea.establishmentId` com `@@unique([establishmentId, name])`, seguindo o mesmo padrão de `BankAccount`/`PaymentMethodConfig`.

3. **Cadastro simples, nunca excluído.** Campos: `name` (obrigatório), `deliveryFee` (Decimal, obrigatório), `neighborhoods` (opcional) e `active` (default `true`). Não existe rota de exclusão — apenas `PATCH` com `active: false`, mesmo padrão de todos os cadastros do sistema (ver ADR 0017, decisão 5). Isso preserva o histórico de pedidos que já usaram aquela área mesmo depois dela deixar de ser oferecida.

4. **Taxa é uma coluna própria em `DeliveryOrder` e em `Sale`, não um item adicional.** Ao criar o pedido, `DeliveryOrder` grava um snapshot de `deliveryAreaId` (referência, `onDelete: SetNull`) e `deliveryFee` (o valor da taxa **no momento da criação do pedido**, imune a alterações futuras da área). A alternativa considerada — adicionar a taxa como uma linha extra em `DeliveryOrderItem`/`SaleItem` com `productId: null` — foi descartada porque o fluxo de conclusão de venda (`app/api/operations/sales/route.ts`, ação `COMPLETE`) resolve cada item do pedido contra o catálogo real (`db.product.findFirst`) para recalcular preço, receita/CMV e baixa de estoque; um item sem produto quebraria essa resolução ou exigiria tratamento especial espalhado por várias rotas (CMV, relatórios, impressão de comanda). Um campo próprio, com o mesmo padrão já usado para `serviceAmount` (taxa de serviço do Salão) em `Sale`, é a opção mais simples de integrar sem reescrever o fluxo de conclusão de venda: `grossTotal` passa a somar `subtotal + serviceAmount + deliveryFee` (branch de banco e branch local, ambas em `app/api/operations/sales/route.ts`), e `Sale.deliveryFee` persiste o valor cobrado para fins de relatório/auditoria, com o mesmo `default(0)` de `serviceAmount`. Pedidos sem área selecionada resultam em `deliveryFee = 0` em todos os pontos, preservando o comportamento atual sem qualquer regressão.

5. **Seleção da área é sempre opcional na criação do pedido.** O fluxo atual de digitar endereço livre continua funcionando sem qualquer alteração obrigatória — o atendente pode simplesmente não escolher nenhuma área (`deliveryAreaId` ausente), e o pedido segue exatamente como antes desta fatia, sem taxa adicional.

6. **Validação cross-tenant ao criar o pedido.** Ao informar `deliveryAreaId`, a rota de criação de pedido (`POST /api/operations/delivery`) valida que a área pertence ao mesmo estabelecimento do pedido e está ativa antes de aplicar a taxa — mesmo padrão já usado para `supplierId`/`bankAccountId` em `app/api/admin/finance/entries/route.ts`. Uma área de outro estabelecimento (ou inativa) é rejeitada com HTTP 400 ("Área de entrega não encontrada.").

7. **Reaproveita a permissão `catalog.manage`, sem criar `delivery-areas.manage`.** Áreas de entrega é, conceitualmente, um cadastro de configuração da loja assim como categorias/produtos — não é uma ação operacional do dia a dia do delivery (isso continua sendo `delivery.operate`), e sim uma configuração administrativa. Criar uma permissão nova adicionaria granularidade que ninguém pediu. Decisão sujeita a revisão se o produto quiser separar quem administra o cardápio de quem administra zonas de entrega.

8. **UI: painel de gestão dentro do próprio `DeliveryManagement.tsx`, não em `SettingsWorkspace`.** Diferente de Fornecedores (sub-aba dentro de `FinanceManagement`), a decisão aqui foi manter a gestão de áreas de entrega como um modal acessível por um botão "Áreas de entrega" no cabeçalho da Central de Delivery (`components/operations/DeliveryAreaSettings.tsx`), visível apenas para quem tem `catalog.manage`. Justificativa: áreas de entrega só fazem sentido no contexto do delivery, e o atendente/gestor já está nessa tela quando precisa criar ou ajustar uma área — evita navegação extra até Configurações para uma tarefa rápida e recorrente (alinhado ao objetivo de produto de reduzir cliques). O seletor de área no formulário de novo pedido usa o mesmo endpoint (`GET /api/operations/delivery` agora retorna `deliveryAreas` e `canManageDeliveryAreas` além dos dados já existentes).

9. **Cálculo de taxa visível antes de confirmar o pedido.** O formulário de novo pedido mostra Subtotal / Taxa de entrega (com o nome da área) / Total do pedido assim que uma área é selecionada, atualizando em tempo real — sem exigir qualquer cálculo mental do atendente antes de confirmar.

10. **Modo local segue o adaptador em memória.** `lib/local-delivery-areas.ts` foi criado no mesmo estilo de `lib/local-finance.ts` (CRUD com checagem de nome duplicado por `sameName`). `lib/local-delivery.ts` foi estendido para aceitar `deliveryAreaId`/`deliveryFee` opcionais na criação do pedido, sem alterar o comportamento de quem não os informa.

11. **Migração manual.** Como nas fatias anteriores, o ambiente de banco não estava acessível durante esta implementação; a migração `20260921090000_areas_de_entrega` foi escrita manualmente seguindo o padrão das migrações mais recentes (`20260920090000_lista_de_compras`) e deve ser aplicada com `npx prisma migrate deploy` antes de liberar a tela em produção. Ela cria a tabela `DeliveryArea`, as colunas `DeliveryOrder.deliveryAreaId`/`DeliveryOrder.deliveryFee` e a coluna `Sale.deliveryFee`.

## Consequências

- Pedidos de delivery sem área selecionada continuam idênticos ao comportamento anterior a esta fatia — nenhuma regressão no fluxo já testado.
- A taxa de entrega fica visível separadamente do subtotal de produtos tanto no cartão do pedido quanto na cobrança final, e é preservada como snapshot no pedido e na venda, mesmo que a área seja editada ou inativada depois.
- Relatórios que somam `Sale.total` continuam corretos; relatórios que decompõem por `subtotal`/`serviceAmount` agora também podem decompor por `deliveryFee` sem inferência.
- Bairros atendidos sendo texto livre significa que não há qualquer verificação automática de que o endereço digitado pelo cliente realmente pertence à área escolhida — a responsabilidade continua sendo do atendente, como já é hoje para o endereço como um todo.
