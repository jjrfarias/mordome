# ADR 0029: Motivos de cancelamento

- Estado: aceito
- Data: 2026-09-16

## Contexto

Hoje todo cancelamento no sistema usa um campo de motivo em texto livre, validado apenas por tamanho mínimo (`z.string().trim().min(3).max(200)`), em quatro pontos: cancelamento de venda (`app/api/operations/sales/route.ts`, ação `CANCEL`), cancelamento de item de comanda já enviado à cozinha (`app/api/operations/floor/route.ts`, ação `CANCEL_SENT_ITEM`), reembolso de venda (`app/api/operations/sales/route.ts`, ação `REFUND`) e movimentação de caixa/reimpressão (que carregam um `reason` mais próximo de justificativa de auditoria do que de "cancelamento"). Digitar o motivo todo cancelamento é lento e gera texto inconsistente para relatórios futuros. Esta fatia entrega um cadastro de motivos pré-definidos por categoria, com seletor no lugar do texto livre, preservando a opção de digitar um motivo customizado quando nenhum da lista servir.

Fora de escopo (explicitamente): Turnos e Modelos de impressão — não fazem parte desta fatia.

## Decisões

1. **Três categorias incluídas: `SALE_CANCEL`, `ITEM_CANCEL`, `REFUND`.** São os três fluxos onde "motivo" significa efetivamente justificar o cancelamento/estorno de algo que já existia (venda, item de comanda, reembolso). Caixa (suprimento/sangria) e Reimpressão ficam de fora: no caixa, o `reason` justifica uma movimentação financeira normal (não um cancelamento), e na reimpressão o `reason` é uma trilha de auditoria de uma ação operacional rotineira, não uma reversão de algo já feito. Ambos continuam com texto livre sem alteração nesta fatia — decisão sujeita a revisão se o produto quiser padronizar também esses dois.

2. **Escopo por organização, não por estabelecimento.** Diferente de `DeliveryArea` (ADR 0028, decisão 2 — amarrada fisicamente a uma unidade), motivos de cancelamento tendem a se repetir em todas as lojas de uma rede (ex.: "Pedido errado", "Cliente desistiu", "Produto com defeito" valem igualmente para qualquer unidade da Família Betão). Segue o mesmo padrão de `FinancialCategory`/`Supplier`: `CancellationReason.organizationId` com `@@unique([organizationId, category, label])`.

3. **Cadastro simples, nunca excluído.** Campos: `category` (enum `CancellationReasonCategory`), `label` (obrigatório), `active` (default `true`). Não existe rota de exclusão — apenas `PATCH` com `active: false`, mesmo padrão de todos os cadastros do sistema (ver ADR 0017, decisão 5; ADR 0028, decisão 3). Isso preserva o histórico e evita que um motivo referenciado em vendas antigas "desapareça" — embora, nesta fatia, o texto final enviado ao servidor seja sempre uma cópia (`label`) e não uma referência (`reasonId`), então inativar um motivo não afeta cancelamentos passados de forma alguma.

4. **Sem mudança de contrato de API nos endpoints existentes.** `CANCEL`, `CANCEL_SENT_ITEM` e `REFUND` continuam recebendo `reason: string` exatamente como antes. A UI monta esse texto a partir da escolha no seletor (o `label` do motivo) ou do campo "Outro" — o servidor não sabe (e não precisa saber) se o texto veio de um cadastro ou foi digitado na hora. Isso elimina qualquer risco de regressão nos três fluxos de cancelamento já testados e evita acoplar validação de servidor a um cadastro que pode estar vazio.

5. **Seletor com fallback "Outro", nunca força cadastro prévio.** O componente `components/operations/ReasonSelect.tsx` busca os motivos ativos da categoria via `GET /api/admin/cancellation-reasons?category=X`. Se a lista vier vazia (nenhum motivo cadastrado ainda), cai direto para o campo de texto livre que já existia — não trava o fluxo operacional esperando alguém cadastrar motivos antes de conseguir cancelar uma venda. Se houver motivos, o `<select>` lista os ativos mais uma opção final "Outro (digite o motivo)", que revela um campo de texto (só quando selecionada, não os dois visíveis ao mesmo tempo) para o fallback.

6. **`GET` liberado para qualquer sessão autenticada da organização; `POST`/`PATCH` exigem `establishments.manage`.** Ler os motivos é necessário para qualquer operador cancelando uma venda/item/reembolso — não é uma ação administrativa e não deveria exigir a mesma permissão de quem cadastra os motivos. Criar/editar motivos reaproveita `establishments.manage` (mesma permissão de `EstablishmentsManagement`), pois é uma configuração administrativa da operação, não financeira (`finance.manage`) nem de estoque/cardápio (`catalog.manage`). Decisão sujeita a revisão se o produto quiser uma permissão dedicada no futuro.

7. **UI de gestão como nova sub-aba em `SettingsWorkspace`**, ao lado de "Estabelecimentos" (`components/admin/CancellationReasonsManagement.tsx`), com filtro por categoria — mesmo padrão visual de `CategoriesTab` em `FinanceManagement.tsx` (formulário + lista com toggle ativar/desativar).

8. **Modo local segue o adaptador em memória.** `lib/local-cancellation-reasons.ts` foi criado no mesmo estilo de `lib/local-delivery-areas.ts` (CRUD com checagem de duplicidade por categoria via `sameLabel`).

9. **Migração manual.** Como nas fatias anteriores, o ambiente de banco não estava acessível durante esta implementação; a migração `20260922090000_motivos_de_cancelamento` foi escrita manualmente seguindo o padrão das migrações mais recentes (`20260921090000_areas_de_entrega`) e deve ser aplicada com `npx prisma migrate deploy` antes de liberar a tela em produção. Ela cria o enum `CancellationReasonCategory` e a tabela `CancellationReason`.

## Consequências

- Cancelar uma venda, um item de comanda ou registrar um reembolso fica mais rápido quando a loja já cadastrou seus motivos mais comuns — menos digitação, texto mais consistente.
- Nenhuma regressão nos três fluxos: o servidor continua recebendo e validando texto livre exatamente como antes; quem não cadastrar nenhum motivo continua digitando manualmente, sem qualquer bloqueio.
- Caixa e Reimpressão continuam com texto livre sem seletor — ficam fora desta fatia por não serem, conceitualmente, "cancelamentos".
- Relatórios futuros que quiserem agrupar cancelamentos por motivo padronizado dependem de a loja efetivamente cadastrar e usar os motivos pré-definidos — não há enforcement de que o atendente escolha da lista em vez de "Outro".
