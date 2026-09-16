# ADR 0027: Análise e simulação de CMV

- Estado: aceito
- Data: 2026-09-16

## Contexto

O Relatório de CMV real (ADR 0026) mostra o custo de mercadoria vendida de vendas JÁ OCORRIDAS: olha para trás. Faltava uma ferramenta de PLANEJAMENTO: o dono escolher um produto (ou uma ficha técnica hipotética, ainda não cadastrada) e simular "se eu vender isso com esta composição, a este preço, qual seria meu CMV e minha margem?" — sem que nada seja salvo. É uma calculadora interativa, não um relatório histórico.

## Decisões

1. **Nenhuma tabela nova, nenhuma rota de escrita nova.** A simulação é inteiramente client-side (recalcula a cada tecla, sem chamada ao servidor). A única chamada ao servidor é para carregar os dados iniciais.

2. **Reaproveitada a rota de leitura já existente `GET /api/admin/recipes`** (usada pela tela de Fichas técnicas) em vez de criar `GET /api/admin/inventory/cmv-simulation`. Ela já retornava `products`, `inventoryItems` e `recipes` — dados suficientes para a simulação. Foi estendida (aditivamente, sem quebrar o formato usado pela tela de Fichas técnicas) com:
   - `inventoryItems[].averageCost`: custo médio ponderado ATUAL de cada item, calculado com `weightedAverageCost` (`lib/cmv.ts`, mesma função do Relatório de CMV) — `null` quando não há nenhuma entrada de estoque com custo registrado, nunca 0 (mesma regra do Relatório de CMV: nunca mascarar "sem informação" como "grátis").
   - `products[].price`: preço de venda atual do produto (via `ProductOffering` ativa da unidade corrente, ou `null` se não houver oferta cadastrada).
   Não foi necessário criar uma rota nova nem duplicar consultas — a mesma query de `establishmentInventoryItem`/`movements` do Relatório de CMV foi reaproveitada dentro da rota de Fichas técnicas.

3. **Cálculo extraído para uma função pura nova, `calculateCmvSimulation` (`lib/cmv.ts`)**, reaproveitando:
   - `calculateRecipeConsumption` (`lib/inventory-domain.ts`) para achar a quantidade consumida de cada componente simulado (mesma fórmula de perda técnica e rendimento usada no consumo real de vendas — nenhuma lógica de consumo duplicada).
   - A mesma regra de "componente sem custo médio conhecido nunca é somado como zero, mas sinaliza `hasUnknownCost`" já usada em `calculateSaleItemCmv`.
   A função recebe uma lista de componentes simulados + rendimento + preço de venda simulado (todos livremente editáveis na UI, sem relação obrigatória com uma ficha técnica real) e devolve CMV total, CMV%, margem bruta e margem%, por unidade vendida. Testada em `tests/cmv.test.ts` (múltiplos componentes, aplicação de perda técnica, custo desconhecido não mascarado, variação de preço simulado recalculando margem, lista vazia sem erro).

4. **UI na aba "Fichas técnicas" (`components/admin/RecipeManagement.tsx`), como uma nova sub-aba "Simulação de CMV"**, não em `InventoryManagement.tsx` (onde fica o Relatório de CMV real). Decisão de produto: a simulação de CMV é uma ferramenta de planejamento de cardápio/ficha técnica (junto de onde a ficha é editada), enquanto o Relatório de CMV é uma visão financeira de vendas passadas (junto de estoque/financeiro). Ficam próximas o bastante (mesmo grupo de permissão) mas em telas diferentes por serem conceitualmente diferentes.

5. **Permissão: reaproveitada `recipes.manage`/`canManageRecipes`** (a mesma que já controla toda a tela de Fichas técnicas), não `finance.summary.view` (usada pelo Relatório de CMV real). Decisão de produto: simular uma ficha técnica é uma atividade de quem já edita fichas técnicas (planejamento de cardápio), não necessariamente de quem vê margem financeira consolidada da operação.

6. **"Usar como base" implementado, com escopo propositalmente limitado**: o botão na simulação apenas pré-preenche o formulário de cadastro de ficha técnica (produto, nome sugerido, componentes) na sub-aba "Fichas técnicas" — não salva nada sozinho. Limitação aceita e documentada: o sistema hoje não tem rota de EDIÇÃO de ficha técnica (`POST /api/admin/recipes` só cria; tentar salvar uma ficha para um produto que já tem ficha continua retornando 409, como antes desta fatia). Ou seja, "usar como base" é útil hoje principalmente para produtos SEM ficha técnica ainda; para revisar uma ficha existente a partir de uma simulação, o dono precisa remover/recriar manualmente (fora do escopo desta fatia — ficha técnica não ter edição é uma limitação pré-existente do sistema, não introduzida aqui).

7. **A simulação começa a partir da ficha técnica atual do produto (se existir) e do preço de venda atual (se houver oferta cadastrada) — ambos livremente editáveis depois**, sem qualquer efeito na ficha/oferta reais. Produto sem ficha começa com uma lista vazia de componentes (rendimento 1, preço em branco), sem erro.

## Consequências

- Nenhuma tabela nova, nenhuma migração. `app/api/admin/recipes/route.ts` (GET) passou a fazer duas consultas adicionais (custo médio por item e preço por produto) — mesmo padrão de consulta já usado no Relatório de CMV, sem lógica de negócio nova na rota (o cálculo continua 100% em `lib/cmv.ts`).
- `RecipeManagement.tsx` ganhou uma segunda sub-aba; o formulário de cadastro existente não mudou de comportamento, só passou a poder ser pré-preenchido pela simulação.
- Fora de escopo, aceito nesta fatia: edição de ficha técnica existente (não existe no sistema); precificação sugerida por margem-alvo (poderia ser calculada invertendo a fórmula, mas não foi pedido nesta fatia).
