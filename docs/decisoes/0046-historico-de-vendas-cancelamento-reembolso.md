# ADR 0046: Histórico de vendas — cancelamento e reembolso

- Estado: aceito
- Data: 2026-09-17

## Contexto

Feedback real do cliente: "não conseguimos identificar como fazer quaisquer alterações como
cancelamento ou trocas de forma de pagamento". Investigado no código: cancelamento (`CANCEL`) e
reembolso (`REFUND`) já existiam por completo na API (`POST /api/operations/sales`, permissões
`sales.cancel`/`sales.refund` — `canCancelSales`/`canRefundSales`), mas **sem nenhuma tela para
encontrar uma venda e acioná-los**. As únicas telas que chamam essas ações hoje são o Salão
(cancelar item de uma comanda ainda aberta) e o Delivery (cancelar um pedido ainda não pago) — uma
venda do PDV já finalizada não tinha NENHUM caminho de UI até essas ações. A tela "Histórico" que
existe é só o log de auditoria (`AuditHistory.tsx`, somente leitura, gate `audit.view`).

"Troca de forma de pagamento" continua fora de escopo (não existe nem na API) — registrada como
próxima pendência (ver "Fora de escopo" abaixo).

## Decisão

1. **Tela nova "Vendas"** (`components/admin/SalesHistory.tsx`), item de navegação próprio (não
   dentro de Configurações nem dentro do Histórico de auditoria), visível para quem tem
   `canCancelSales` OU `canRefundSales` — é uma tela de AÇÃO, não de leitura, então usa o mesmo
   gate das próprias permissões de ação, não `audit.view` (um operador pode ter permissão de
   cancelar vendas sem enxergar a auditoria completa da organização, e vice-versa).

2. **Nova rota `GET /api/operations/sales`** (mesmo arquivo do `POST` que já processa
   COMPLETE/CANCEL/REFUND — não uma rota separada), listando as vendas do período com o `status`
   explícito. Diferente de todos os relatórios de vendas (ADR 0033 em diante, que excluem
   `CANCELLED` e totalmente `REFUNDED` — são uma visão de BI), esta lista mostra **todas** as
   vendas de qualquer status, porque o dono precisa achar até uma venda já cancelada (para
   conferência, não para agir de novo nela). Sem `from`/`to` na URL, cai no dia de hoje (não no mês
   como os relatórios) — é uma tela operacional de consulta rápida, não uma análise de período.

3. **Modo servidor**: `Sale.status` já é persistido diretamente — a rota só popula a partir do
   Prisma (`db.sale.findMany` com `payments`/`refunds`/`items`), sem nenhuma reconstrução.

4. **Modo local**: nova função `listLocalSalesForManagement` (`lib/local-finance.ts`), irmã de
   `listLocalSalesForReport` (mesma técnica de reconstituir a partir do log de auditoria
   `SALE_COMPLETE`/`SALE_CANCEL`/`SALE_REFUND` — não existe "banco" de vendas local separado), mas
   SEM os filtros de exclusão do relatório, e com um campo `status` calculado
   (`COMPLETED`/`CANCELLED`/`PARTIALLY_REFUNDED`/`REFUNDED`) que os relatórios nunca precisaram
   expor.

5. **Nenhuma rota de mutação nova**: os botões "Cancelar"/"Reembolsar" da tela chamam o mesmo
   `POST /api/operations/sales` (ações `CANCEL`/`REFUND`) que o Salão/Delivery já usam — zero
   duplicação de regra de negócio (estorno de estoque, validação de caixa aberto, limite de
   reembolso pelo saldo já reembolsado, etc., todas já existentes e testadas).

6. **Motivo obrigatório via `ReasonSelect`** (categorias `SALE_CANCEL`/`REFUND`, ADR 0029), mesmo
   componente e mesmas categorias já usadas pelo Salão — sem inventar um terceiro cadastro de
   motivos.

7. **Reembolso simplificado a um único meio de pagamento por vez** (não reaproveita o
   `PaymentComposer` de split usado no fechamento de venda): cobre o caso comum (a imensa maioria
   dos reembolsos volta pela mesma forma que entrou) sem a complexidade de um composer completo
   nesta fatia. A API já aceita `payments` como array — dividir o reembolso em mais de uma forma
   continua possível diretamente pela API, só não tem UI para isso ainda.

8. **"Repor estoque automaticamente" só aparece quando o reembolso é do valor total restante** —
   mesma regra que a API já impõe (`REFUND_PARTIAL_STOCK` em reembolso parcial), a tela só evita
   mostrar uma opção que o servidor rejeitaria.

## Fora de escopo

- **Troca de forma de pagamento de uma venda já concluída** continua sem existir, nem na API. É
  uma mudança de modelo mais delicada (os registros de `Payment` alimentam conciliação bancária e
  relatórios financeiros — simplesmente editar o método quebraria essa trilha) e fica como
  pendência separada, não encaixada apressadamente aqui.
- Delivery e Salão continuam com seus próprios caminhos de cancelamento específicos (cancelar item
  de comanda aberta, cancelar pedido de delivery não pago) — a tela nova é um complemento para
  vendas JÁ CONCLUÍDAS de qualquer canal, não uma substituição desses fluxos.
