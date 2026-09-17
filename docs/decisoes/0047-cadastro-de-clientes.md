# ADR 0047: Cadastro de clientes

- Estado: aceito
- Data: 2026-09-17

## Contexto

Item pendente identificado no cruzamento com o menu de referência (Saipos): "Relacionamento com
cliente → Cadastro de clientes" nunca foi implementado. O sistema já guardava `customerName`/
`customerPhone` como texto livre em cada `DeliveryOrder`, mas nunca reconhecia que dois pedidos
eram do mesmo cliente — sem histórico, sem "cliente desde", sem nada além de uma etiqueta.

## Decisão

**Cadastro + integração com Delivery** (não só uma tela de CRUD isolada): o valor real de um CRM
básico é reconhecer cliente repetido, não só ter uma lista de nomes.

1. **Escopo organização, não por unidade** (`Customer.organizationId`, `@@unique([organizationId,
   phone])`): o mesmo cliente é reconhecido em qualquer das 4 unidades do Betão — diferente de
   `DeliveryArea`/`PreparationStation` (por estabelecimento), mais parecido com `Supplier`/
   `Coupon` (por organização). Telefone é o identificador porque é o único dado que já existia
   consistentemente em todo pedido de delivery; nome não serve (não é único) e e-mail/documento são
   opcionais.

2. **Telefone normalizado para dígitos apenas** na gravação (`21999990000`, nunca
   `"(21) 99999-0000"`) — sem isso, o mesmo cliente digitado com máscaras diferentes em pedidos
   diferentes viraria dois cadastros. A busca (tela de Clientes, `GET /api/admin/customers`) aceita
   qualquer formato digitado e normaliza dos dois lados antes de comparar.

3. **Reconhecimento automático ao criar um pedido de delivery**, sem exigir nenhum passo manual
   antes: `POST /api/operations/delivery` (ação `CREATE`) agora faz um `upsert` por
   `(organizationId, phone)` na mesma transação que cria o pedido — encontra o cliente existente
   (atualizando o nome, caso tenha mudado) ou cadastra um novo na hora. `DeliveryOrder` ganhou
   `customerId` opcional (`onDelete: SetNull`) só para essa referência; os campos `customerName`/
   `customerPhone` continuam existindo como estavam (snapshot da venda), sem quebrar nada que já
   dependia deles.

4. **Autopreenchimento no formulário de novo pedido** (`DeliveryManagement.tsx`): ao digitar um
   telefone com 8+ dígitos, uma busca com debounce (`GET /api/operations/customer-lookup?phone=`,
   nova rota, somente leitura, gate `delivery.operate` — não exige a permissão de gerenciar o
   cadastro) preenche nome e endereço automaticamente SE esses campos ainda estiverem vazios (nunca
   sobrescreve o que o atendente já digitou), e mostra "Cliente conhecido: N pedido(s) · R$X em
   compras" como contexto.

5. **"Pedidos"/"Gasto" excluem pedidos `CANCELLED`** (mesmo critério usado pelos relatórios de
   vendas, ADR 0033 e seguintes) — um pedido cancelado não deveria contar como engajamento do
   cliente nem inflar o valor gasto.

6. **Nova permissão granular `customers.manage`** (mesmo padrão `<módulo>.manage` de
   `catalog.manage`/`recipes.manage`), controlando só o CRUD da tela Clientes — a busca operacional
   do Delivery usa `delivery.operate`, permissão já existente, para não exigir dois perfis
   diferentes de quem só atende pedido.

7. **Modo local**: `lib/local-customers.ts` (bucket por organização, mesmo padrão de
   `LocalSupplier` em `lib/local-finance.ts`) para o cadastro, e `getLocalCustomerOrderStats`
   (`lib/local-delivery.ts`) para pedidos/gasto — calculado direto dos pedidos de delivery já
   armazenados na unidade ativa (soma de itens + taxa de entrega), sem depender do rastro de
   auditoria como os relatórios de vendas fazem. Simplificação deliberada: soma só a unidade ativa
   (o modo servidor soma a organização inteira, todas as unidades) — modo local é só para demo/uso
   offline, nunca o ambiente real do cliente.

## Consequências

- Nenhum dado histórico é migrado: pedidos de delivery já existentes (antes desta fatia) ficam com
  `customerId = null` para sempre — não há como saber retroativamente quem é quem a partir de
  nomes/telefones já gravados sem um cadastro por trás. Só pedidos criados a partir de agora
  entram no histórico do cliente.
- PDV e Salão continuam sem vínculo com cliente (fora de escopo — só fazem sentido pra
  identificação de cliente em pedidos com endereço/contato, que é o caso do Delivery).
- Achados dois bugs reais na rotina de teste antes de entregar: a busca por nome/telefone (tanto em
  modo local quanto servidor) tratava um termo de busca sem dígitos como "contém string vazia" no
  telefone, fazendo QUALQUER termo textual (ex.: "joão") retornar todos os clientes, não só os que
  batiam pelo nome. Corrigido para só aplicar o filtro por telefone quando o termo tiver ao menos
  um dígito.
