# ADR 0041: Cupons de desconto (cadastro + integração no PDV + relatório)

- Estado: aceito
- Data: 2026-09-16

## Contexto

O menu original citava "Cupons gerados" como relatório (Relatórios) e "Cupons de desconto" como
cadastro (Relacionamento com cliente), mas **nenhum sistema de cupom existia** no domínio — não
havia `Coupon` no schema, nem qualquer lugar que reconhecesse um código de cupom. O relatório não
faz sentido sem o cadastro por trás, então esta fatia entrega os dois juntos: cadastro de cupons,
integração assistida no fluxo de venda (só PDV) e o relatório "Cupons gerados".

Já existe desconto na venda hoje: `Sale.discount`/`Sale.discountReason`, preenchidos manualmente
no PDV via `PaymentComposer` e validados/persistidos em `app/api/operations/sales/route.ts`
(permissões `discount.apply`/`discount.override`, limite de 10% sem perfil autorizador). Esta fatia
não muda esse mecanismo — o cupom é uma forma alternativa e assistida de preencher os mesmos dois
campos.

## Decisões

1. **`Coupon` pertence à organização, não ao estabelecimento.** Mesmo raciocínio do ADR 0029
   (Motivos de cancelamento) e do padrão de `FinancialCategory`/`Supplier`: cupons promocionais
   ("BEMVINDO10", "NATAL2026") tendem a valer para toda a rede, não para uma unidade isolada.
   `Coupon.organizationId` com `@@unique([organizationId, code])` — o código é único por
   organização, não globalmente.

2. **Campos do cadastro:** `code` (normalizado para maiúsculas em `normalizeCouponCode`, ver
   `lib/coupons.ts`, para evitar "bemvindo10" e "BEMVINDO10" coexistirem), `discountType` (enum
   `PERCENT`/`FIXED`), `discountValue` (percentual 0-100 quando `PERCENT`, valor fixo em R$ quando
   `FIXED`), `validFrom`/`validUntil` opcionais (nulo = sem limite naquela ponta — "sem validade"
   nunca expira, não "expira imediatamente"), `maxUses` opcional (nulo = ilimitado), `usesCount`
   (contador, default 0) e `active` (nunca excluído, só inativado — mesmo padrão de sempre).

3. **Permissão `catalog.manage` reaproveitada para o CRUD, sem permissão dedicada.** Cupom é uma
   ferramenta comercial/promocional do mesmo domínio de quem já configura preços, produtos e
   promoções do cardápio — não é uma configuração puramente administrativa
   (`establishments.manage`, usada por Motivos de cancelamento/Turnos) nem financeira
   (`finance.manage`). `GET`/`POST`/`PATCH` de `app/api/admin/coupons/route.ts` exigem
   `session.canManageCatalog`. Decisão sujeita a revisão se o produto quiser uma permissão dedicada
   no futuro (ex. se cupom crescer para campanhas mais elaboradas).

4. **Validação/cálculo em módulo puro compartilhado (`lib/coupons.ts`, `validateCoupon`).** Dado um
   cupom (ou `null`) e o subtotal atual, decide se pode ser usado agora — nessa ordem: existe,
   ativo, dentro de `validFrom`/`validUntil`, `usesCount < maxUses` (se houver limite) — e calcula o
   desconto (percentual sobre o subtotal, ou o valor fixo, sempre limitado a não superar o próprio
   subtotal nem ficar negativo). Não conhece Prisma nem o modo local: a rota de validação
   (`app/api/operations/coupons/validate/route.ts`) e a finalização de venda (`app/api/operations/
   sales/route.ts`, os dois modos) buscam o cupom do seu próprio armazenamento e chamam a mesma
   função — nenhuma lógica de desconto duplicada entre modo Prisma e modo local.

5. **Integração com o desconto existente: cupom substitui `discount`/`discountReason`, sem mudar
   o schema de `Sale`.** A rota de validação (`POST /api/operations/coupons/validate`) é só uma
   consulta assistida — não incrementa `usesCount` nem gera qualquer registro, para não "gastar" um
   uso de alguém que só digitou o código e não fechou a venda. Quando o PDV finaliza a venda com
   `couponCode` preenchido, `app/api/operations/sales/route.ts` **recalcula o cupom no servidor a
   partir do subtotal real da venda** (nunca confiando no desconto que o cliente já tenha calculado
   sozinho na validação) e usa esse resultado como `resolvedDiscount`/`resolvedDiscountReason`
   (`` `Cupom ${code}` ``) em vez do `data.discount`/`data.discountReason` enviados — as mesmas
   checagens de permissão (`canApplyDiscount`, limite de 10% sem `canOverrideDiscount`) continuam
   valendo por cima do desconto resultante do cupom. `Sale` continua sem `couponId`: o cupom nunca
   vira uma dimensão nova da venda, é só uma forma alternativa de preencher os dois campos que já
   existiam.

6. **`CouponRedemption` criado para o relatório poder listar uso por venda.** A alternativa mais
   simples seria só incrementar `Coupon.usesCount` sem registrar nada por venda, mas isso impediria
   o relatório de calcular "quantos usos e quanto de desconto CADA CUPOM gerou DENTRO DO PERÍODO
   consultado" — sem um registro por resgate, só seria possível saber o total histórico
   (`usesCount`), não um recorte por período. Por isso `CouponRedemption` guarda `couponId`,
   `saleId` (`@@unique`, uma venda nunca usa dois cupons nesta fatia), `establishmentId` (para
   isolar o relatório por unidade) e `discountApplied` (o valor exato daquele uso, já que
   `discountValue` do cupom pode mudar depois via `PATCH` sem afetar resgates passados). Criado na
   mesma transação que cria a `Sale` (modo Prisma) ou logo após `settleLocalSale` (modo local), e
   `Coupon.usesCount` incrementado junto — nunca antes de a venda ser efetivamente concluída.

7. **Só PDV integrado nesta fatia — Salão e Delivery ficam de fora, pendência futura.** O campo de
   cupom (`app/page.tsx`, componente `Pos`) fica ao lado do `PaymentComposer`, com um botão "Aplicar
   cupom" que chama a rota de validação com o subtotal atual do carrinho; se válido, preenche
   `discount`/`discountReason` automaticamente (campos que continuam editáveis manualmente se o
   cupom for removido) e guarda o código aplicado, enviado como `couponCode` na finalização.
   Integrar o mesmo fluxo em Salão (fechamento de comanda) e Delivery (fechamento de pedido) é
   estrutural mas não foi feito aqui para manter esta fatia enxuta — ambos já usam a mesma rota de
   finalização (`app/api/operations/sales/route.ts`, que já aceita `couponCode` em qualquer canal),
   então a integração futura é só de UI, sem mudança de backend.

8. **Sem sistema de cliente/CRM.** Cupom é um código genérico, sem vínculo a um cliente específico,
   sem limite "uma vez por cliente" — isso exigiria um cadastro de cliente que não existe no
   domínio hoje e está fora de escopo desta fatia.

9. **Modo local: `lib/local-coupons.ts`** no mesmo padrão em memória de
   `lib/local-cancellation-reasons.ts` — CRUD com checagem de duplicidade de código por organização
   (comparação normalizada), mais `redeemLocalCoupon`/`listLocalCouponRedemptions` para o relatório.
   `app/api/operations/sales/route.ts` (branch `isLocalAuthEnabled()`) foi estendido para aceitar
   `couponCode` opcional, com a mesma lógica de recálculo no servidor da decisão 5.

10. **Nova permissão granular `reports.coupons_generated.view`**, mesmo padrão `reports.<slug>.view`
    do ADR 0033, registrada em `lib/permissions.ts`, incluída em `OWNER_PERMISSIONS`, propagada ao
    array padrão de `permissionKeys` do modo local (`lib/local-auth.ts`) e concedida a todo
    `CustomRole` com `systemTemplate = true` pela migração
    `20261004090100_relatorio_cupons_gerados`.

11. **Relatório "Cupons gerados" lista TODOS os cupons cadastrados até o fim do período, não só os
    usados** ("gerados" = criados). Diferente de todo relatório anterior da série (que filtra um
    EVENTO pelo período), aqui a lista de cupons é filtrada por `createdAt <= to` (cumulativo até o
    fim do período, não uma janela `[from, to]` — um cupom criado em janeiro continua aparecendo no
    relatório de março), enquanto `usesInPeriod`/`discountAppliedInPeriod` são calculados só a
    partir dos `CouponRedemption` com `createdAt` dentro de `[from, to]`. `usesCountTotal` mostra o
    histórico completo (`Coupon.usesCount`), sem filtro de período, para diferenciar "quantos usos
    esse cupom já teve na vida" de "quantos usos ele teve neste recorte". Cálculo puro isolado em
    `lib/reports/coupons-generated.ts` (`buildCouponsGeneratedRows`/`summarizeCouponsGenerated`),
    testável com `node --test`, sem Prisma/Next.

12. **Migração de schema em duas partes** (mesmo padrão dos ADRs anteriores, ambiente de banco não
    acessível durante esta implementação): `20261004090000_cupons_de_desconto` (enum
    `CouponDiscountType`, tabelas `Coupon`/`CouponRedemption`) e
    `20261004090100_relatorio_cupons_gerados` (permissão + concessão aos perfis `systemTemplate`).
    Devem ser aplicadas com `npx prisma migrate deploy` antes de liberar a tela em produção.

## Consequências

- Cupom vira uma forma mais rápida e padronizada de aplicar desconto no PDV, sem duplicar a lógica
  de desconto já existente (`discount`/`discountReason` em `Sale` continuam sendo a única fonte de
  verdade sobre "quanto foi descontado nesta venda").
- Salão e Delivery continuam só com desconto manual — pendência explícita para uma fatia futura, sem
  mudança de backend necessária (a rota de vendas já aceita `couponCode` em qualquer canal).
- Sem vínculo a cliente: cupom genérico, sem limite por pessoa — se o produto quiser isso no futuro,
  precisa primeiro de um cadastro de cliente, hoje inexistente.
- O relatório depende de `CouponRedemption` para o recorte por período; se uma venda com cupom for
  cancelada, o resgate não é revertido nesta fatia (mesma limitação que outros relatórios baseados
  em `Sale.discount` têm com vendas canceladas) — decisão aceitável porque o relatório é sobre
  "quanto desconto o cupom gerou", não sobre o estado atual das vendas.
