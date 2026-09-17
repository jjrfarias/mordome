# ADR 0048: Frentes de caixa

- Estado: aceito
- Data: 2026-09-17

## Contexto

Item pendente identificado no cruzamento com o menu de referência (Saipos): "Financeiro → Frentes
de caixas". Hoje cada operador já abre sua própria `CashSession` na unidade (`@@unique` parcial
`[establishmentId, openedById]` só para status `OPEN`) — isso já permite vários caixas abertos ao
mesmo tempo, mas sem nome/identidade própria: não dá pra saber, olhando o histórico, se uma sessão
foi do "caixa do balcão" ou do "caixa do delivery", só quem a abriu.

## Decisão

**Cadastro de frentes nomeadas + seleção ao abrir caixa**, com o vínculo sempre OPCIONAL:
estabelecimentos que nunca cadastrarem nenhuma frente continuam abrindo caixa exatamente como
antes desta fatia, sem nenhuma tela nova aparecer no caminho.

1. **`CashFront`**: cadastro simples por estabelecimento (`id`, `name`, `active`), mesmo padrão de
   `DiningTable`/`WorkShift` — nunca excluído, só inativado. Permissão administrativa reaproveitada:
   `establishments.manage` (mesma de Turnos/Motivos de cancelamento), sem criar uma permissão nova
   só para isso.

2. **`CashSession.cashFrontId` opcional** (`onDelete: SetNull`): o formulário de abrir caixa
   (`CashManagement.tsx`) só mostra o seletor de frente quando existe pelo menos uma cadastrada e
   ativa; com zero cadastradas, o campo nem aparece. Escolher uma frente é sempre opcional mesmo
   quando existem várias — o operador pode abrir "sem frente específica" se preferir.

3. **Só uma sessão aberta por vez POR FRENTE**, mesmo com operadores diferentes — uma frente
   representa um terminal físico, não faz sentido duas pessoas "abrirem o mesmo caixa físico"
   simultaneamente. Índice único parcial no banco
   (`CashSession_cashFrontId_open_key ON ("cashFrontId") WHERE status = 'OPEN' AND "cashFrontId"
   IS NOT NULL`), mesmo padrão de robustez já usado pela exclusividade por operador
   (`CashSession_establishmentId_openedById_open_key`), com uma verificação prévia amigável antes
   de tentar criar (mensagem de erro específica) e o índice como garantia final contra corrida.
   Sessões sem frente vinculada (`cashFrontId = NULL`) nunca conflitam entre si — no Postgres,
   `NULL` nunca é igual a `NULL` num índice único.

4. **Nome da frente aparece no resumo do caixa aberto e no histórico** (`cashSummary`/
   `summarizeLocalCash` ganharam `cashFrontName`), sem mudar o cálculo de nenhum valor esperado —
   é só um rótulo a mais.

5. **Modo local**: `lib/local-cash-fronts.ts` (bucket por estabelecimento, mesmo padrão de
   `lib/local-floor.ts` para mesas), e `lib/local-cash.ts` ganhou `cashFrontId` opcional na sessão
   e `getLocalOpenCashFrontSession` para a mesma checagem de exclusividade por frente.

## Consequências

- Nenhuma migração de dados: sessões de caixa já existentes ficam com `cashFrontId = null` para
  sempre — não há como saber retroativamente qual seria "a frente" de uma sessão já fechada antes
  desta fatia.
- Relatórios/conciliação por frente (agrupar o Fluxo de caixa ou os Acertos por `cashFrontId`, por
  exemplo) ficam fora de escopo desta fatia — hoje é só cadastro + abertura vinculada; agregações
  específicas por frente são uma evolução futura, se o cliente sentir falta.
