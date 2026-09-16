# ADR 0034: Relatório "Desempenho por atendente/garçom"

- Estado: aceito
- Data: 2026-09-16

## Contexto

O ADR 0033 entregou o framework de relatórios e deixou "desempenho por atendente/garçom" fora de
escopo, para vir em fatia própria reaproveitando a base. Esta fatia entrega esse relatório: para um
período, um ranking de vendas por PESSOA (quantidade, valor líquido total vendido, ticket médio),
separado em duas seções — Atendentes (canal PDV) e Garçons (canal Salão) — já que a mesma pessoa
pode operar os dois canais no mesmo período.

**Isto não é o mesmo conceito do ADR 0018 (Acertos de entregadores e garçons).** Acertos calcula
*quanto pagar de comissão* a alguém, a partir de `UserCommissionRule` (valor fixo por entrega ou
percentual sobre vendas), e produz um `SettlementRecord` quando o pagamento é registrado. Este
relatório é só uma **visão de desempenho** (ranking de vendas por pessoa) — não lê, não grava e não
referencia `UserCommissionRule`/`SettlementRecord` em nenhum ponto, e não existe nenhum conceito de
comissão aqui. As duas fatias têm sobreposição conceitual (ambas ligam uma pessoa a vendas por
canal/papel observado) mas servem propósitos diferentes: uma informa "quanto pagar", a outra "quem
vendeu mais". Ver `docs/decisoes/0018-acertos-entregadores-garcons.md`.

## Decisões

1. **Critério de "operador da venda" é exatamente o já usado no resto do sistema: `Sale.operatorId`**
   (quem processou o pagamento/fechamento da venda), o mesmo campo usado por `app/api/operations/
   sales/route.ts` ao criar a venda e por Acertos (ADR 0018) para identificar o garçom responsável.
   Nenhum critério novo foi inventado — deliberadamente, para manter consistência com a mesma
   simplificação (e a mesma limitação conhecida) já aceita pelo ADR 0018: quem fecha a conta pode
   não ser sempre quem atendeu a mesa, mas é o único vínculo que já carrega o valor final da venda
   sem exigir joins adicionais.

2. **Papel observado vem do canal da venda, não de um campo fixo no cadastro do usuário.** Vendas
   `channel = POS` colocam o operador na seção "Atendentes"; vendas `channel = FLOOR` colocam na
   seção "Garçons". Vendas `channel = DELIVERY` ficam de fora deste relatório (não há papel de
   atendente/garçom associado a entrega — isso é coberto por Acertos → Entregadores). Uma pessoa que
   opera PDV e Salão no mesmo período aparece nas duas seções, com números independentes — não é
   fundida numa linha única, porque as seções representam papéis diferentes, não a pessoa em si.

3. **Valor líquido descontando reembolso, mesmo critério do Fluxo de caixa (ADR 0016) e dos demais
   relatórios (ADR 0033):** `total - refunded` por venda, somado por pessoa/papel. Vendas
   canceladas e totalmente reembolsadas (`refunded >= total`) são excluídas — mesmo filtro de
   "vendas concluídas no período" já usado por Vendas por período/Faturamento por dia.

4. **Sem persistência nova.** Igual aos outros relatórios do framework, é somente leitura calculada
   sob demanda a partir de `Sale`/`SaleItem`/`Payment`/`Refund` (modo servidor) ou do log de
   auditoria local (modo local) — nenhuma tabela nova.

5. **Cálculo puro isolado em `lib/reports/staff-performance.ts`**, em vez de crescer ainda mais
   `lib/reports/sales.ts`. Diferente de Vendas por período/Faturamento por dia (que agregam por
   venda/por dia), este relatório agrega por pessoa+papel, produzindo um formato de linha
   suficientemente diferente para justificar um arquivo próprio — mas reaproveitando o mesmo tipo
   `SaleRecord` de `lib/reports/sales.ts` como entrada (agora estendido com `operatorId`/
   `operatorName` opcionais, ignorados pelos dois relatórios existentes).

6. **`SaleRecord.operatorId`/`operatorName` no modo local vêm do próprio evento de auditoria
   `SALE_COMPLETE`** (`actorId`/`actorName`), sem precisar de nenhuma estrutura nova: quem registra
   o evento de conclusão da venda é sempre quem processou o pagamento (mesmo ator que, no modo
   servidor, grava `Sale.operatorId`). Ver `lib/local-finance.ts` (`listLocalSalesForReport`).

7. **Nova permissão granular `reports.performance_by_staff.view`**, seguindo exatamente o padrão do
   ADR 0033 (`reports.<slug>.view`), registrada em `lib/permissions.ts`, incluída em
   `OWNER_PERMISSIONS`, propagada ao array padrão de `permissionKeys` do modo local
   (`lib/local-auth.ts`) e concedida a todo `CustomRole` com `systemTemplate = true` pela migração
   `20260927090000_relatorio_desempenho_por_pessoa`, mesmo padrão da migração `20260926090000_
   framework_de_relatorios`.

8. **UI: duas tabelas (`ReportTable`) na mesma tela**, "Atendentes (PDV)" e "Garçons (Salão)", cada
   uma com sua própria exportação Excel/PDF (reaproveitando a exportação genérica sem duplicação) e
   sua própria mensagem de estado vazio. Não foi criado um filtro de papel (dropdown) em vez de duas
   seções fixas — decidido nesta fatia, sujeito a revisão, por ser mais simples de implementar e por
   deixar visível de imediato quando uma pessoa tem zero vendas de um dos dois canais, sem exigir
   alternância manual.

## Consequências

- Uma pessoa sem nenhuma venda no período (em nenhum dos dois canais) simplesmente não aparece em
  nenhuma das duas tabelas — ao contrário do ADR 0018 (Acertos), que mostra o candidato com valor
  zero quando ele tem regra mas nenhum movimento. Aqui não existe "regra" nem "candidato": a pessoa
  só existe no relatório se vendeu algo.
- Mesma limitação de `Sale.operatorId` já registrada no ADR 0018: se o Betão apurar que quem fecha a
  conta nem sempre é o garçom que atendeu a mesa, o critério de identificação do "garçom" (aqui e em
  Acertos) precisa ser revisto junto.
- Este relatório não substitui nem se conecta a Acertos — são consultados separadamente. Se no
  futuro o produto quiser ver comissão junto ao ranking de desempenho, isso é uma revisão de
  produto explícita, não implícita nesta fatia.
