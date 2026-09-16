import { MembershipStatus, PaymentMethod, Prisma, SaleChannel } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { calculateRecipeConsumption } from "@/lib/inventory-domain";
import { cancelLocalSale, completeLocalSale, findLocalSale, findLocalSaleByIdempotency, refundLocalSale, settleLocalSale } from "@/lib/local-sales";
import { getLocalOpenCashSession, registerLocalCashSale, type LocalPaymentMethod } from "@/lib/local-cash";
import { listLocalCatalog } from "@/lib/local-catalog";
import { recordLocalAudit } from "@/lib/local-audit";
import { requestAuditMetadata } from "@/lib/audit";
import { closeLocalTab, getLocalOpenTab } from "@/lib/local-floor";
import { attachLocalDeliverySale, getLocalDeliveryOrder } from "@/lib/local-delivery";
import { resolveIngredientSelections, type SelectedOptionSnapshot } from "@/lib/ingredient-options";

const optionSelectionSchema = z.object({ groupId: z.string().min(1), optionIds: z.array(z.string().min(1)).max(20) });
const saleItemSchema = z.object({ productId: z.string().min(1), quantity: z.number().int().positive().max(999), discount: z.number().finite().min(0).optional(), selectedOptions: z.array(optionSelectionSchema).max(10).optional() });
const paymentSchema = z.object({ method: z.string().min(2).max(40), amount: z.number().finite().positive(), receivedAmount: z.number().finite().positive().optional() });
const completeSchema = z.object({ action: z.literal("COMPLETE"), channel: z.enum(SaleChannel).refine(channel => channel === "POS" || channel === "FLOOR" || channel === "DELIVERY"), items: z.array(saleItemSchema).min(1), payments: z.array(paymentSchema).min(1).max(10), discount: z.number().finite().min(0).default(0), discountReason: z.string().trim().min(3).max(200).optional(), table: z.number().int().positive().optional(), tabId: z.string().min(1).optional(), deliveryOrderId: z.string().min(1).optional(), idempotencyKey: z.string().uuid() });
const cancelSchema = z.object({ action: z.literal("CANCEL"), saleId: z.string().min(1), reason: z.string().trim().min(3).max(200), idempotencyKey: z.string().uuid() });
const refundSchema = z.object({ action: z.literal("REFUND"), saleId: z.string().min(1), amount: z.number().finite().positive(), payments: z.array(paymentSchema).min(1).max(10), restoreStock: z.boolean().default(false), reason: z.string().trim().min(3).max(200), idempotencyKey: z.string().uuid() });
const actionSchema = z.discriminatedUnion("action", [completeSchema, cancelSchema, refundSchema]);

class IngredientOptionError extends Error {}

const paymentMethods: Record<string, PaymentMethod> = { Pix: "PIX", "Cartão de crédito": "CREDIT_CARD", "Cartão de débito": "DEBIT_CARD", Dinheiro: "CASH" };
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const resolvePayments = (payments: z.infer<typeof paymentSchema>[]) => payments.map(payment => ({ method: (paymentMethods[payment.method] ?? "OTHER") as PaymentMethod, amount: roundMoney(payment.amount), receivedAmount: payment.receivedAmount === undefined ? undefined : roundMoney(payment.receivedAmount), changeAmount: payment.method === "Dinheiro" ? roundMoney(Math.max(0, (payment.receivedAmount ?? payment.amount) - payment.amount)) : 0 }));

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? { session, membership } : null;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados da venda inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (data.action === "CANCEL") {
      if (!session.canCancelSales) return Response.json({ error: "Você não tem permissão para cancelar vendas." }, { status: 403 });
      const existing = findLocalSale({ establishmentId: session.establishment.id, saleId: data.saleId });
      if (!existing) return Response.json({ error: "Venda não encontrada." }, { status: 404 });
      const result = cancelLocalSale({ establishmentId: session.establishment.id, saleId: data.saleId });
      if (result === "NOT_FOUND") return Response.json({ error: "Venda não encontrada." }, { status: 404 });
      if (result === "CASH_CLOSED") return Response.json({ error: "O caixa desta venda já foi fechado. Use o futuro fluxo de reembolso." }, { status: 409 });
      if (result === "CANCELLED") recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "SALE_CANCEL", entityType: "Sale", entityId: data.saleId, reason: data.reason, before: { status: "COMPLETED" }, after: { status: "CANCELLED" }, ...requestAuditMetadata(request) });
      return Response.json({ status: result });
    }
    if (data.action === "REFUND") {
      if (!session.canRefundSales) return Response.json({ error: "Você não tem permissão para registrar reembolsos." }, { status: 403 });
      const cash = getLocalOpenCashSession(session.establishment.id, session.user.id); if (!cash) return Response.json({ error: "Abra o caixa para registrar o reembolso." }, { status: 409 });
      const payments = resolvePayments(data.payments); if (roundMoney(payments.reduce((sum, item) => sum + item.amount, 0)) !== roundMoney(data.amount)) return Response.json({ error: "A soma dos meios de reembolso deve ser igual ao valor." }, { status: 400 });
      const refunded = refundLocalSale({ establishmentId: session.establishment.id, saleId: data.saleId, cashSessionId: cash.id, amount: data.amount, payments: payments.map(payment => ({ method: payment.method as LocalPaymentMethod, amount: payment.amount })), restoreStock: data.restoreStock });
      if (refunded === "NOT_FOUND") return Response.json({ error: "Venda não encontrada." }, { status: 404 });
      if (refunded === "AMOUNT_EXCEEDED") return Response.json({ error: "O valor supera o saldo disponível para reembolso." }, { status: 409 });
      if (refunded === "INSUFFICIENT_CASH") return Response.json({ error: "Dinheiro insuficiente no caixa atual." }, { status: 409 });
      if (refunded === "CASH_REQUIRED") return Response.json({ error: "Abra o caixa para registrar o reembolso." }, { status: 409 });
      recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "SALE_REFUND", entityType: "Sale", entityId: data.saleId, reason: data.reason, after: { amount: data.amount, payments, restoreStock: data.restoreStock, status: refunded.status }, ...requestAuditMetadata(request) });
      return Response.json({ sale: refunded }, { status: 201 });
    }
    if (data.channel === "POS" && !session.canSellPos) return Response.json({ error: "Acesso negado ao PDV." }, { status: 403 });
    if (data.channel === "FLOOR" && !session.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 });
    if (data.channel === "DELIVERY" && !session.canOperateDelivery) return Response.json({ error: "Acesso negado ao delivery." }, { status: 403 });
    const duplicate = findLocalSaleByIdempotency(session.establishment.id, data.idempotencyKey); if (duplicate) return Response.json({ sale: duplicate });
    const localTab = data.tabId ? getLocalOpenTab(session.establishment.id, data.tabId) : null;
    if (data.tabId && (!localTab || data.channel !== "FLOOR")) return Response.json({ error: "Comanda não encontrada ou já fechada." }, { status: 409 });
    if (localTab?.tab.items.some(item => item.active && item.quantity > item.sentQuantity)) return Response.json({ error: "Envie os itens pendentes para a cozinha antes de fechar." }, { status: 409 });
    const localDelivery = data.deliveryOrderId ? getLocalDeliveryOrder(session.establishment.id, data.deliveryOrderId) : null;
    if (data.deliveryOrderId && (!localDelivery || data.channel !== "DELIVERY" || localDelivery.saleId)) return Response.json({ error: "Pedido de delivery não encontrado ou já pago." }, { status: 409 });
    const localItems = localTab ? localTab.tab.items.filter(item => item.active && item.quantity > 0).map(item => ({ productId: item.productId, quantity: item.quantity })) : localDelivery ? localDelivery.items.map(item => ({ productId: item.productId, quantity: item.quantity })) : data.items;
    if (!localItems.length) return Response.json({ error: localDelivery ? "O pedido de delivery está vazio." : "A comanda está vazia." }, { status: 409 });
    // Grupos de ingrediente são resolvidos no momento da venda direta do PDV (ver ADR 0022).
    // Salão e Delivery já resolveram a escolha quando o item foi adicionado à comanda/pedido —
    // o retrato (selectedOptionsSnapshot) já vem travado no item local, propagado abaixo.
    const directCatalogForOptions = !localTab && !localDelivery ? listLocalCatalog(session.establishment.id) : null;
    const directResolved: { unitPrice: number; snapshot: SelectedOptionSnapshot[] }[] = [];
    if (directCatalogForOptions) {
      for (const item of data.items) {
        const product = directCatalogForOptions.find(candidate => candidate.id === item.productId);
        if (!product) return Response.json({ error: "Produto indisponível nesta unidade ou canal." }, { status: 409 });
        const resolved = resolveIngredientSelections(product.ingredientGroups, item.selectedOptions);
        if ("error" in resolved) return Response.json({ error: resolved.error }, { status: 400 });
        directResolved.push({ unitPrice: roundMoney(product.price + resolved.priceDelta), snapshot: resolved.snapshot });
      }
    }
    const cash = getLocalOpenCashSession(session.establishment.id, session.user.id); if (!cash) return Response.json({ error: "Abra o caixa antes de finalizar uma venda." }, { status: 409 });
    const result = completeLocalSale({ establishmentId: session.establishment.id, idempotencyKey: data.idempotencyKey, channel: data.channel, items: localItems.map(item => ({ productId: item.productId, quantity: item.quantity })), operatorId: session.user.id });
    if (result.status === "PRODUCT_NOT_FOUND") return Response.json({ error: "Produto indisponível nesta unidade ou canal." }, { status: 409 });
    if (result.status === "INSUFFICIENT_STOCK") return Response.json({ error: "Estoque insuficiente para concluir a venda." }, { status: 409 });
    if (result.status === "NOT_CONFIGURED") return Response.json({ error: "A ficha usa um item não configurado nesta unidade." }, { status: 409 });
    if (result.status !== "DUPLICATE") {
      const catalog = listLocalCatalog(session.establishment.id);
      const items = localTab ? localTab.tab.items.filter(item => item.active && item.quantity > 0).map(item => ({ productId: item.productId, quantity: item.quantity, productName: item.productName, unitPrice: item.unitPrice, selectedOptionsSnapshot: item.selectedOptionsSnapshot })) : localDelivery ? localDelivery.items.map(item => ({ productId: item.productId, quantity: item.quantity, productName: item.productName, unitPrice: item.unitPrice, selectedOptionsSnapshot: item.selectedOptionsSnapshot })) : localItems.map((item, index) => ({ productId: item.productId, quantity: item.quantity, productName: catalog.find(product => product.id === item.productId)?.name ?? "Produto", unitPrice: directResolved[index]?.unitPrice ?? catalog.find(product => product.id === item.productId)?.price ?? 0, selectedOptionsSnapshot: directResolved[index]?.snapshot }));
      const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const grossTotal = roundMoney(subtotal * (data.channel === "FLOOR" ? 1.1 : 1));
      if (data.discount > 0 && !session.canApplyDiscount) return Response.json({ error: "Você não tem permissão para aplicar descontos." }, { status: 403 });
      if (data.discount > grossTotal) return Response.json({ error: "O desconto não pode superar o total da venda." }, { status: 400 });
      if (data.discount > 0 && !data.discountReason) return Response.json({ error: "Informe o motivo do desconto." }, { status: 400 });
      if (grossTotal > 0 && data.discount / grossTotal > 0.1 && !session.canOverrideDiscount) return Response.json({ error: "Desconto acima de 10% exige um perfil autorizador." }, { status: 403 });
      const total = roundMoney(grossTotal - data.discount); const payments = resolvePayments(data.payments);
      if (roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0)) !== total) return Response.json({ error: "A soma dos pagamentos deve ser igual ao total da venda." }, { status: 400 });
      if (payments.some(payment => payment.method !== "CASH" && payment.receivedAmount !== undefined)) return Response.json({ error: "Valor recebido e troco são permitidos apenas em dinheiro." }, { status: 400 });
      for (const payment of payments) registerLocalCashSale(cash.id, payment.method as LocalPaymentMethod, payment.amount);
      if (result.sale) {
        settleLocalSale(result.sale.id, { cashSessionId: cash.id, payments: payments.map(payment => ({ method: payment.method as LocalPaymentMethod, amount: payment.amount })), total, refunded: 0 });
        recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "SALE_COMPLETE", entityType: "Sale", entityId: result.sale.id, reason: localTab ? `Fechamento da mesa ${localTab.table.number}` : localDelivery ? `Pedido de delivery para ${localDelivery.customerName}` : "Venda direta no PDV", after: { channel: data.channel, table: localTab?.table.number, tabId: localTab?.tab.id, deliveryOrderId: localDelivery?.id, payments, discount: data.discount, discountReason: data.discountReason, items, subtotal, total, cashSessionId: cash.id }, ...requestAuditMetadata(request) });
        if (data.tabId) {
          const closed = closeLocalTab({ establishmentId: session.establishment.id, tabId: data.tabId, saleId: result.sale.id });
          if (closed !== "TAB_NOT_FOUND") recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "TAB_CLOSE", entityType: "Tab", entityId: closed.tab.id, reason: `Comanda da mesa ${closed.table.number} fechada`, before: { status: "OPEN" }, after: { status: "PAID", saleId: result.sale.id }, ...requestAuditMetadata(request) });
        }
        if (data.deliveryOrderId && localDelivery) {
          attachLocalDeliverySale(session.establishment.id, data.deliveryOrderId, result.sale.id);
          recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "UPDATE", entityType: "DeliveryOrder", entityId: localDelivery.id, reason: `Pedido de delivery pago e concluído`, before: { status: localDelivery.status }, after: { status: "DELIVERED", saleId: result.sale.id }, ...requestAuditMetadata(request) });
        }
      }
    }
    return Response.json({ sale: result.sale }, { status: result.status === "DUPLICATE" ? 200 : 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (data.action === "CANCEL") { if (!actor.session.canCancelSales) return Response.json({ error: "Você não tem permissão para cancelar vendas." }, { status: 403 }); return cancelSale(actor.session, data, requestAuditMetadata(request)); }
  if (data.action === "REFUND") { if (!actor.session.canRefundSales) return Response.json({ error: "Você não tem permissão para registrar reembolsos." }, { status: 403 }); return refundSale(actor.session, data, requestAuditMetadata(request)); }
  if (data.channel === "POS" && !actor.session.canSellPos) return Response.json({ error: "Acesso negado ao PDV." }, { status: 403 });
  if (data.channel === "FLOOR" && !actor.session.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 });
  if (data.channel === "DELIVERY" && !actor.session.canOperateDelivery) return Response.json({ error: "Acesso negado ao delivery." }, { status: 403 });

  const duplicate = await db.sale.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (duplicate) return Response.json({ sale: { id: duplicate.id, total: Number(duplicate.total) } });

  try {
    const sale = await db.$transaction(async tx => {
      const establishment = await tx.establishment.findFirst({ where: { id: actor.session.establishment.id, organizationId: actor.session.organization.id, active: true } });
      if (!establishment) throw new Error("ESTABLISHMENT_NOT_FOUND");
      const cash = await tx.cashSession.findFirst({ where: { establishmentId: actor.session.establishment.id, openedById: actor.session.user.id, status: "OPEN" } });
      if (!cash) throw new Error("CASH_REQUIRED");
      const tab = data.tabId ? await tx.tab.findFirst({ where: { id: data.tabId, establishmentId: actor.session.establishment.id, status: "OPEN" }, include: { table: true, items: { where: { active: true, quantity: { gt: 0 } } } } }) : null;
      if (data.tabId && (!tab || data.channel !== "FLOOR")) throw new Error("TAB_NOT_FOUND");
      if (tab?.items.some(item => Number(item.quantity) > Number(item.sentQuantity))) throw new Error("UNSENT_ITEMS");
      const deliveryOrder = data.deliveryOrderId ? await tx.deliveryOrder.findFirst({ where: { id: data.deliveryOrderId, establishmentId: actor.session.establishment.id, saleId: null }, include: { items: true } }) : null;
      if (data.deliveryOrderId && (!deliveryOrder || data.channel !== "DELIVERY")) throw new Error("DELIVERY_NOT_FOUND");
      // Grupos de ingrediente são resolvidos no momento da venda direta do PDV (ver ADR 0022).
      // Salão e Delivery já resolveram a escolha quando o item foi adicionado à comanda/pedido —
      // aqui só propagamos o preço e o retrato (selectedOptionsSnapshot) já travados no TabItem/DeliveryOrderItem.
      const applyIngredientOptions = !tab && !deliveryOrder;
      const requestedItems: { productId: string; quantity: number; lockedUnitPrice?: number; lockedSelectedOptionsSnapshot?: unknown; selectedOptions?: { groupId: string; optionIds: string[] }[] }[] = tab ? tab.items.map(item => ({ productId: item.productId ?? "", quantity: Number(item.quantity), lockedUnitPrice: Number(item.unitPrice), lockedSelectedOptionsSnapshot: item.selectedOptionsSnapshot })) : deliveryOrder ? deliveryOrder.items.map(item => ({ productId: item.productId ?? "", quantity: item.quantity, lockedUnitPrice: Number(item.unitPrice), lockedSelectedOptionsSnapshot: item.selectedOptionsSnapshot })) : data.items;
      if (!requestedItems.length || requestedItems.some(item => !item.productId)) throw new Error(deliveryOrder ? "DELIVERY_EMPTY" : "TAB_EMPTY");
      const saleItems: { productId: string; productName: string; quantity: number; unitPrice: number; total: number; recipeSnapshot: Prisma.InputJsonValue | typeof Prisma.JsonNull; selectedOptionsSnapshot: Prisma.InputJsonValue | typeof Prisma.JsonNull }[] = [];
      const aggregated = new Map<string, { quantity: number; allowNegative: boolean; movements: { quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null }[] }>();

      for (const requested of requestedItems) {
        const product = await tx.product.findFirst({
          where: { id: requested.productId, organizationId: actor.session.organization.id, active: true },
          include: { ingredientGroups: { where: { active: true }, include: { options: { where: { active: true } } } }, variants: { where: { isDefault: true, active: true }, take: 1, include: { offerings: { where: { establishmentId: actor.session.establishment.id, channel: data.channel, active: true }, take: 1 }, recipes: { where: { establishmentId: actor.session.establishment.id, kind: "SALE", active: true }, take: 1, include: { components: { include: { inventoryItem: { include: { establishments: { where: { establishmentId: actor.session.establishment.id, active: true }, include: { movements: { select: { quantity: true, unitCost: true } } } } } } } } } } } } },
        });
        const variant = product?.variants[0]; const offering = variant?.offerings[0];
        if (!product || !variant || !offering) throw new Error("PRODUCT_NOT_AVAILABLE");
        let ingredientPriceDelta = 0;
        let selectedOptionsSnapshot: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
        if (applyIngredientOptions) {
          const resolved = resolveIngredientSelections(product.ingredientGroups.map(group => ({ id: group.id, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active, options: group.options.map(option => ({ id: option.id, name: option.name, priceDelta: Number(option.priceDelta), active: option.active })) })), requested.selectedOptions);
          if ("error" in resolved) throw new IngredientOptionError(resolved.error);
          ingredientPriceDelta = resolved.priceDelta;
          if (resolved.snapshot.length) selectedOptionsSnapshot = resolved.snapshot;
        } else if (Array.isArray(requested.lockedSelectedOptionsSnapshot) && requested.lockedSelectedOptionsSnapshot.length) {
          selectedOptionsSnapshot = requested.lockedSelectedOptionsSnapshot as Prisma.InputJsonValue;
        }
        const recipe = variant.recipes[0];
        const snapshotComponents: { inventoryItemId: string; name: string; baseUnit: string; quantity: number; wastePercent: number }[] = [];
        if (recipe) {
          const calculated = calculateRecipeConsumption(recipe.components.map(component => ({ inventoryItemId: component.inventoryItemId, quantity: Number(component.quantity), wastePercent: Number(component.wastePercent) })), requested.quantity, Number(recipe.yieldQuantity));
          for (const consumption of calculated) {
            const component = recipe.components.find(candidate => candidate.inventoryItemId === consumption.inventoryItemId)!;
            const configuration = component.inventoryItem.establishments[0];
            if (!configuration) throw new Error("INVENTORY_NOT_CONFIGURED");
            snapshotComponents.push({ inventoryItemId: component.inventoryItemId, name: component.inventoryItem.name, baseUnit: component.inventoryItem.baseUnit, quantity: consumption.quantity, wastePercent: Number(component.wastePercent) });
            if (configuration.trackingMode !== "AUTOMATIC") continue;
            const current = aggregated.get(configuration.id);
            aggregated.set(configuration.id, { quantity: (current?.quantity ?? 0) + consumption.quantity, allowNegative: configuration.allowNegative, movements: configuration.movements });
          }
        }
        const unitPrice = requested.lockedUnitPrice ?? roundMoney(Number(offering.price) + ingredientPriceDelta); const total = roundMoney(unitPrice * requested.quantity);
        saleItems.push({ productId: product.id, productName: product.name, quantity: requested.quantity, unitPrice, total, recipeSnapshot: recipe ? { recipeId: recipe.id, recipeName: recipe.name, yieldQuantity: Number(recipe.yieldQuantity), components: snapshotComponents } : Prisma.JsonNull, selectedOptionsSnapshot });
      }

      for (const [establishmentItemId, consumption] of aggregated) {
        const balance = consumption.movements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
        if (!consumption.allowNegative && balance < consumption.quantity) throw new Error("INSUFFICIENT_STOCK");
        const valued = consumption.movements.filter(movement => movement.unitCost !== null);
        const value = valued.reduce((sum, movement) => sum + Number(movement.quantity) * Number(movement.unitCost), 0);
        const unitCost = balance > 0 && valued.length ? (value / balance).toFixed(4) : undefined;
        await tx.stockMovement.create({ data: { establishmentItemId, type: "CONSUMPTION", quantity: -consumption.quantity, unitCost, actorId: actor.session.user.id, sourceType: "SALE", sourceId: data.idempotencyKey, reason: `Consumo automático da venda ${data.channel}`, idempotencyKey: `${data.idempotencyKey}:${establishmentItemId}` } });
      }
      const subtotal = roundMoney(saleItems.reduce((sum, item) => sum + item.total, 0));
      const serviceAmount = data.channel === "FLOOR" ? roundMoney(subtotal * Number(establishment.serviceRate) / 100) : 0;
      const grossTotal = roundMoney(subtotal + serviceAmount);
      if (data.discount > 0 && !actor.session.canApplyDiscount) throw new Error("DISCOUNT_FORBIDDEN");
      if (data.discount > grossTotal) throw new Error("DISCOUNT_INVALID");
      if (data.discount > 0 && !data.discountReason) throw new Error("DISCOUNT_REASON_REQUIRED");
      if (grossTotal > 0 && data.discount / grossTotal > 0.1 && !actor.session.canOverrideDiscount) throw new Error("DISCOUNT_APPROVAL_REQUIRED");
      const total = roundMoney(grossTotal - data.discount); const payments = resolvePayments(data.payments);
      if (roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0)) !== total) throw new Error("PAYMENT_MISMATCH");
      if (payments.some(payment => payment.method !== "CASH" && payment.receivedAmount !== undefined)) throw new Error("CHANGE_ONLY_CASH");
      const created = await tx.sale.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, cashSessionId: cash.id, operatorId: actor.session.user.id, channel: data.channel, subtotal, discount: data.discount, serviceAmount, total, idempotencyKey: data.idempotencyKey, items: { create: saleItems }, payments: { create: payments } } });
      await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "SALE_COMPLETE", entityType: "Sale", entityId: created.id, reason: tab ? `Fechamento da mesa ${tab.table.number}` : deliveryOrder ? `Pedido de delivery para ${deliveryOrder.customerName}` : "Venda direta no PDV", after: { channel: data.channel, table: tab?.table.number, tabId: tab?.id, deliveryOrderId: deliveryOrder?.id, payments, discount: data.discount, discountReason: data.discountReason, items: saleItems.map(item => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total })), subtotal, serviceAmount, total, cashSessionId: cash.id }, ...requestAuditMetadata(request) } });
      if (data.discount > 0) await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "DISCOUNT_APPLY", entityType: "Sale", entityId: created.id, reason: data.discountReason!, after: { amount: data.discount, percent: grossTotal ? roundMoney(data.discount / grossTotal * 100) : 0 }, ...requestAuditMetadata(request) } });
      if (tab) { await tx.tab.update({ where: { id: tab.id }, data: { status: "PAID", closedAt: new Date(), saleId: created.id } }); await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "TAB_CLOSE", entityType: "Tab", entityId: tab.id, reason: `Comanda da mesa ${tab.table.number} fechada`, before: { status: "OPEN" }, after: { status: "PAID", saleId: created.id, tableNumber: tab.table.number }, ...requestAuditMetadata(request) } }); }
      if (deliveryOrder) { await tx.deliveryOrder.update({ where: { id: deliveryOrder.id }, data: { status: "DELIVERED", saleId: created.id } }); await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "UPDATE", entityType: "DeliveryOrder", entityId: deliveryOrder.id, reason: "Pedido de delivery pago e concluído", before: { status: deliveryOrder.status }, after: { status: "DELIVERED", saleId: created.id }, ...requestAuditMetadata(request) } }); }
      return created;
    });
    return Response.json({ sale: { id: sale.id, total: Number(sale.total) } }, { status: 201 });
  } catch (error) {
    if (error instanceof IngredientOptionError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === "PRODUCT_NOT_AVAILABLE") return Response.json({ error: "Produto indisponível nesta unidade ou canal." }, { status: 409 });
    if (error instanceof Error && error.message === "INVENTORY_NOT_CONFIGURED") return Response.json({ error: "A ficha usa um item não configurado nesta unidade." }, { status: 409 });
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") return Response.json({ error: "Estoque insuficiente para concluir a venda." }, { status: 409 });
    if (error instanceof Error && error.message === "CASH_REQUIRED") return Response.json({ error: "Abra o caixa antes de finalizar uma venda." }, { status: 409 });
    if (error instanceof Error && error.message === "TAB_NOT_FOUND") return Response.json({ error: "Comanda não encontrada ou já fechada." }, { status: 409 });
    if (error instanceof Error && error.message === "TAB_EMPTY") return Response.json({ error: "A comanda está vazia." }, { status: 409 });
    if (error instanceof Error && error.message === "DELIVERY_NOT_FOUND") return Response.json({ error: "Pedido de delivery não encontrado ou já pago." }, { status: 409 });
    if (error instanceof Error && error.message === "DELIVERY_EMPTY") return Response.json({ error: "O pedido de delivery está vazio." }, { status: 409 });
    if (error instanceof Error && error.message === "UNSENT_ITEMS") return Response.json({ error: "Envie os itens pendentes para a cozinha antes de fechar." }, { status: 409 });
    if (error instanceof Error && error.message === "DISCOUNT_FORBIDDEN") return Response.json({ error: "Você não tem permissão para aplicar descontos." }, { status: 403 });
    if (error instanceof Error && error.message === "DISCOUNT_INVALID") return Response.json({ error: "O desconto não pode superar o total da venda." }, { status: 400 });
    if (error instanceof Error && error.message === "DISCOUNT_REASON_REQUIRED") return Response.json({ error: "Informe o motivo do desconto." }, { status: 400 });
    if (error instanceof Error && error.message === "DISCOUNT_APPROVAL_REQUIRED") return Response.json({ error: "Desconto acima de 10% exige um perfil autorizador." }, { status: 403 });
    if (error instanceof Error && error.message === "PAYMENT_MISMATCH") return Response.json({ error: "A soma dos pagamentos deve ser igual ao total da venda." }, { status: 400 });
    if (error instanceof Error && error.message === "CHANGE_ONLY_CASH") return Response.json({ error: "Valor recebido e troco são permitidos apenas em dinheiro." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { const existing = await db.sale.findUnique({ where: { idempotencyKey: data.idempotencyKey } }); return Response.json({ sale: existing ? { id: existing.id, total: Number(existing.total) } : null }); }
    return Response.json({ error: "Não foi possível concluir a venda." }, { status: 500 });
  }
}

async function cancelSale(session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>, data: z.infer<typeof cancelSchema>, metadata: ReturnType<typeof requestAuditMetadata>) {
  try {
    const sale = await db.$transaction(async tx => {
      const current = await tx.sale.findFirst({ where: { id: data.saleId, organizationId: session.organization.id, establishmentId: session.establishment.id }, include: { cashSession: true } });
      if (!current) throw new Error("SALE_NOT_FOUND");
      if (current.status === "CANCELLED") return current;
      if (current.cashSession?.status !== "OPEN") throw new Error("CASH_CLOSED");
      const claimed = await tx.sale.updateMany({ where: { id: current.id, status: "COMPLETED" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      if (claimed.count !== 1) throw new Error("ALREADY_CANCELLED");
      const consumptions = await tx.stockMovement.findMany({ where: { sourceType: "SALE", sourceId: current.idempotencyKey, type: "CONSUMPTION", establishmentItem: { establishmentId: session.establishment.id } } });
      for (const movement of consumptions) await tx.stockMovement.create({ data: { establishmentItemId: movement.establishmentItemId, type: "REVERSAL", quantity: -Number(movement.quantity), unitCost: movement.unitCost, actorId: session.user.id, sourceType: "SALE_CANCELLATION", sourceId: current.id, reason: data.reason, idempotencyKey: `${data.idempotencyKey}:${movement.id}` } });
      await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "SALE_CANCEL", entityType: "Sale", entityId: current.id, reason: data.reason, before: { status: current.status, total: Number(current.total) }, after: { status: "CANCELLED" }, ...metadata } });
      return tx.sale.findUniqueOrThrow({ where: { id: current.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ sale: { id: sale.id, status: sale.status } });
  } catch (error) {
    if (error instanceof Error && error.message === "SALE_NOT_FOUND") return Response.json({ error: "Venda não encontrada." }, { status: 404 });
    if (error instanceof Error && error.message === "ALREADY_CANCELLED") return Response.json({ error: "Esta venda já foi cancelada." }, { status: 409 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "Você não tem permissão para cancelar esta venda." }, { status: 403 });
    if (error instanceof Error && error.message === "CASH_CLOSED") return Response.json({ error: "O caixa desta venda já foi fechado. Use o futuro fluxo de reembolso." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return Response.json({ error: "A venda foi alterada por outra operação. Atualize e tente novamente." }, { status: 409 });
    return Response.json({ error: "Não foi possível cancelar a venda." }, { status: 500 });
  }
}

async function refundSale(session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>, data: z.infer<typeof refundSchema>, metadata: ReturnType<typeof requestAuditMetadata>) {
  try {
    const refund = await db.$transaction(async tx => {
      const duplicate = await tx.refund.findUnique({ where: { idempotencyKey: data.idempotencyKey } }); if (duplicate) return duplicate;
      const sale = await tx.sale.findFirst({ where: { id: data.saleId, organizationId: session.organization.id, establishmentId: session.establishment.id, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] } }, include: { refunds: true } });
      if (!sale) throw new Error("REFUND_SALE_NOT_FOUND");
      const refundedBefore = roundMoney(sale.refunds.reduce((sum, item) => sum + Number(item.amount), 0)); const remaining = roundMoney(Number(sale.total) - refundedBefore);
      if (roundMoney(data.amount) > remaining) throw new Error("REFUND_AMOUNT_EXCEEDED");
      const payments = resolvePayments(data.payments); if (roundMoney(payments.reduce((sum, item) => sum + item.amount, 0)) !== roundMoney(data.amount)) throw new Error("REFUND_PAYMENT_MISMATCH");
      const cash = await tx.cashSession.findFirst({ where: { establishmentId: session.establishment.id, openedById: session.user.id, status: "OPEN" }, include: { movements: true, sales: { where: { status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, include: { payments: true } }, refunds: { include: { payments: true } } } }); if (!cash) throw new Error("REFUND_CASH_REQUIRED");
      const cashRefund = payments.filter(payment => payment.method === "CASH").reduce((sum, payment) => sum + payment.amount, 0);
      const cashSales = cash.sales.flatMap(item => item.payments).filter(payment => payment.method === "CASH").reduce((sum, payment) => sum + Number(payment.amount), 0);
      const priorCashRefunds = cash.refunds.flatMap(item => item.payments).filter(payment => payment.method === "CASH").reduce((sum, payment) => sum + Number(payment.amount), 0);
      const cashMovements = cash.movements.reduce((sum, movement) => sum + (movement.type === "SUPPLY" ? Number(movement.amount) : -Number(movement.amount)), 0);
      if (cashRefund > Number(cash.openingAmount) + cashSales - priorCashRefunds + cashMovements) throw new Error("REFUND_INSUFFICIENT_CASH");
      const totalRefund = roundMoney(refundedBefore + data.amount) >= Number(sale.total);
      if (data.restoreStock && !totalRefund) throw new Error("REFUND_PARTIAL_STOCK");
      const created = await tx.refund.create({ data: { saleId: sale.id, cashSessionId: cash.id, actorId: session.user.id, amount: data.amount, restoreStock: data.restoreStock, reason: data.reason, idempotencyKey: data.idempotencyKey, payments: { create: payments.map(payment => ({ method: payment.method, amount: payment.amount })) } } });
      if (data.restoreStock) {
        const consumptions = await tx.stockMovement.findMany({ where: { sourceType: "SALE", sourceId: sale.idempotencyKey, type: "CONSUMPTION", establishmentItem: { establishmentId: session.establishment.id } } });
        for (const movement of consumptions) await tx.stockMovement.create({ data: { establishmentItemId: movement.establishmentItemId, type: "REVERSAL", quantity: -Number(movement.quantity), unitCost: movement.unitCost, actorId: session.user.id, sourceType: "SALE_REFUND", sourceId: created.id, reason: data.reason, idempotencyKey: `${data.idempotencyKey}:${movement.id}` } });
      }
      const status = totalRefund ? "REFUNDED" : "PARTIALLY_REFUNDED"; await tx.sale.update({ where: { id: sale.id }, data: { status } });
      await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "SALE_REFUND", entityType: "Refund", entityId: created.id, reason: data.reason, before: { saleStatus: sale.status, refunded: refundedBefore }, after: { saleId: sale.id, amount: data.amount, payments, restoreStock: data.restoreStock, saleStatus: status }, ...metadata } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ refund: { id: refund.id, amount: Number(refund.amount) } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "REFUND_SALE_NOT_FOUND") return Response.json({ error: "Venda não encontrada ou indisponível para reembolso." }, { status: 404 });
    if (error instanceof Error && error.message === "REFUND_AMOUNT_EXCEEDED") return Response.json({ error: "O valor supera o saldo disponível para reembolso." }, { status: 409 });
    if (error instanceof Error && error.message === "REFUND_PAYMENT_MISMATCH") return Response.json({ error: "A soma dos meios de reembolso deve ser igual ao valor." }, { status: 400 });
    if (error instanceof Error && error.message === "REFUND_CASH_REQUIRED") return Response.json({ error: "Abra o caixa para registrar o reembolso." }, { status: 409 });
    if (error instanceof Error && error.message === "REFUND_INSUFFICIENT_CASH") return Response.json({ error: "Dinheiro insuficiente no caixa atual para este reembolso." }, { status: 409 });
    if (error instanceof Error && error.message === "REFUND_PARTIAL_STOCK") return Response.json({ error: "A reposição automática do estoque está disponível no reembolso total. No parcial, faça um ajuste dos itens devolvidos." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return Response.json({ error: "A venda foi alterada. Atualize e tente novamente." }, { status: 409 });
    return Response.json({ error: "Não foi possível registrar o reembolso." }, { status: 500 });
  }
}
