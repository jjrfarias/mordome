# ADR 0051: Taxa de entrega e vitrine no pedido online

- Estado: aceito
- Data: 2026-09-17

## Contexto

A tela de pedido online (`/pedido-online/[establishmentId]`, ADR 0045) nunca mostrava taxa de
entrega — o cliente só via o subtotal dos produtos, mesmo quando a unidade já tinha `DeliveryArea`
cadastradas (ADR 0028) com taxa fixa por região, usadas pela tela interna de Delivery. O cliente
descobria o valor real só depois, quando o atendente confirmava o pedido pelo telefone/WhatsApp.

A tela também era single-column, sem navegação rápida entre categorias e sem sacola visível
enquanto o cliente navega o cardápio — só uma barra fixa no rodapé que aparece com item no
carrinho, mesmo em telas grandes de desktop.

## Decisão

1. **`GET /api/public/orders/[establishmentId]` agora retorna `deliveryAreas`** (id/nome/taxa,
   só ativas), e o formulário de dados do cliente (passo "Seus dados") ganhou um `<select>` para
   escolher a região — mesmo cadastro (`DeliveryArea`) já usado pela tela interna de Delivery,
   sem nenhuma tabela nova. Sem área selecionada, taxa é 0 (mesmo critério do Delivery interno:
   pedido sem área nunca fica bloqueado).

2. **`POST .../orders` aceita `deliveryAreaId` opcional** e recalcula a taxa no servidor a partir
   do cadastro (nunca confiando no valor que o cliente já viu na tela, mesmo padrão de
   recálculo no servidor usado por cupom/desconto), gravando em `DeliveryOrder.deliveryAreaId`/
   `deliveryFee` — os mesmos campos que o Delivery interno já usa, então o relatório "Vendas por
   área de entrega" (ADR 0036) passa a incluir pedidos online sem nenhuma mudança nele.

3. **Layout ganhou abas de categoria sticky** (`.public-menu-tabs`, rolagem suave até a seção) e,
   a partir de 980px de largura, uma **sacola lateral fixa** (`.public-menu-sidebar`) ao lado do
   cardápio — a barra fixa no rodapé (mobile) continua existindo, só escondida nesse breakpoint via
   `.public-menu-cartbar{display:none}`, para não duplicar o resumo do carrinho.

## Fora de escopo (registrado, não implementado nesta fatia)

Horário de funcionamento (loja aberta/fechada com bloqueio de pedido) e banner de capa da unidade
exigiriam campos novos em `Establishment` (nenhum existe hoje — nem endereço, nem horário, nem
imagem de capa) e uma tela de configuração para o dono preencher, não só o consumo desses dados na
tela pública. Ficou fora desta fatia por ser um escopo de configuração próprio, não uma extensão do
fluxo de pedido já existente.
