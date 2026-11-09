import { isMarketplaceOrder } from "./ifood-import.ts";
import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";
import { z } from "zod";
import { resolveIngredientSelections, type SelectedOptionSnapshot } from "./ingredient-options.ts";
import { comboGroupsInclude, mapComboGroupsToIngredientGroups } from "./combo-catalog.ts";

export const deliveryAdditionSchema = z.object({
  orderId: z.string().min(1), idempotencyKey: z.string().uuid(),
  mode: z.enum(["PRODUCT", "EXTRAS"]), productId: z.string().optional(), itemId: z.string().optional(),
  quantity: z.number().int().min(1).max(99),
  selectedOptions: z.array(z.object({ groupId: z.string().min(1), optionIds: z.array(z.string().min(1)).max(20) })).max(10).default([]),
});
export class DeliveryAdditionError extends Error {}
function fail(message: string): never { throw new DeliveryAdditionError(message); }
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function addToDelivery(db: PrismaClient, actor: { establishmentId: string; organizationId: string; userId: string; canOperateFloor?: boolean; canOperateDelivery?: boolean; canManageFloor?: boolean }, input: z.infer<typeof deliveryAdditionSchema>) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delivery:${input.orderId}`}))`;
    const order = await tx.deliveryOrder.findFirst({ where: { id: input.orderId, establishmentId: actor.establishmentId, establishment: { organizationId: actor.organizationId } }, include: { items: true } });
    if (!order) fail("Pedido não encontrado.");
    const prior = await tx.order.findUnique({ where: { deliveryParentId_amendmentKey: { deliveryParentId: order.id, amendmentKey: input.idempotencyKey } } });
    if (prior) return { kitchenOrderId: prior.id, duplicate: true };
    if (isMarketplaceOrder(order.origin)) fail("Altere pedidos do iFood e 99Food pelo Gestor.");
    if (order.saleId || !["RECEIVED", "PREPARING"].includes(order.status)) fail("Só é possível acrescentar itens antes do pagamento e da saída/retirada.");
    const kitchen = order.kitchenOrderId ? await tx.order.findFirst({ where: { id: order.kitchenOrderId, tab: { establishmentId: actor.establishmentId, status: "OPEN" } }, include: { tab: { include: { table: true } } } }) : null;
    if (!kitchen || kitchen.status === "CANCELLED" || (kitchen.status === "DELIVERED" && kitchen.tab.table.isCounter)) fail("Pedido sem comanda de cozinha aberta para complementos.");
    if (kitchen.tab.table.isCounter ? actor.canOperateDelivery === false : actor.canOperateFloor === false || (actor.canManageFloor === false && kitchen.tab.table.assignedWaiterId && kitchen.tab.table.assignedWaiterId !== actor.userId)) fail("Acesso negado ao pedido nesta mesa.");
    const item = input.mode === "EXTRAS" ? order.items.find(item => item.id === input.itemId) : null;
    if (input.mode === "EXTRAS" && (!item || input.quantity > item.quantity)) fail("Selecione um item e uma quantidade válida do pedido.");
    const productId = input.mode === "EXTRAS" ? item!.productId : input.productId;
    if (!productId) fail("Selecione um produto cadastrado.");
    const offering = await tx.productOffering.findFirst({ where: { establishmentId: actor.establishmentId, channel: kitchen.tab.table.isCounter ? "DELIVERY" : "FLOOR", active: true, variant: { isDefault: true, active: true, productId, product: { active: true, organizationId: actor.organizationId } } }, include: { variant: { include: { product: { include: { ingredientGroups: { where: { active: true }, include: { options: { where: { active: true } } } }, comboGroups: comboGroupsInclude } } } } } });
    if (!offering) fail("Produto indisponível no cadastro desta unidade.");
    const product = offering.variant.product;
    const groups = product.isCombo ? mapComboGroupsToIngredientGroups(product.comboGroups) : product.ingredientGroups.map(group => ({ ...group, options: group.options.map(option => ({ ...option, priceDelta: Number(option.priceDelta) })) }));
    const previous = Array.isArray(item?.selectedOptionsSnapshot) ? item!.selectedOptionsSnapshot as unknown as SelectedOptionSnapshot[] : [];
    let options: SelectedOptionSnapshot[];
    let delta: number;
    if (input.mode === "EXTRAS") {
      if (product.isCombo) fail("Para combos, acrescente um novo produto ao pedido.");
      const optional = groups.filter(group => group.minSelections === 0);
      const resolved = resolveIngredientSelections(optional, input.selectedOptions);
      if ("error" in resolved) fail(resolved.error);
      if (!resolved.snapshot.length) fail("Selecione pelo menos um adicional.");
      for (const extra of resolved.snapshot) {
        if (previous.some(old => old.groupName === extra.groupName && old.optionName === extra.optionName)) fail("Este adicional já está no item. Atualize o pedido para conferir.");
        if (extra.priceDelta < 0) fail("Esta opção não é um acréscimo válido.");
      }
      for (const group of optional) {
        if (previous.filter(o => o.groupName === group.name).length + resolved.snapshot.filter(o => o.groupName === group.name).length > group.maxSelections) fail(`Limite de adicionais atingido em ${group.name}.`);
      }
      options = resolved.snapshot; delta = round(resolved.priceDelta);
    } else {
      const resolved = resolveIngredientSelections(groups, input.selectedOptions);
      if ("error" in resolved) fail(resolved.error);
      options = resolved.snapshot; delta = round(Number(offering.price) + resolved.priceDelta);
    }
    if (item) {
      const data = { unitPrice: round(Number(item.unitPrice) + delta), selectedOptionsSnapshot: [...previous, ...options] as Prisma.InputJsonValue };
      if (input.quantity === item.quantity) await tx.deliveryOrderItem.update({ where: { id: item.id }, data });
      else {
        await tx.deliveryOrderItem.update({ where: { id: item.id }, data: { quantity: item.quantity - input.quantity } });
        await tx.deliveryOrderItem.create({ data: { deliveryOrderId: order.id, productId: item.productId, productName: item.productName, quantity: input.quantity, ...data } });
      }
    } else await tx.deliveryOrderItem.create({ data: { deliveryOrderId: order.id, productId: product.id, productName: product.name, quantity: input.quantity, unitPrice: delta, selectedOptionsSnapshot: options as Prisma.InputJsonValue } });
    const description = input.mode === "EXTRAS" ? `ACRESCENTAR em ${item!.productName}: ${options.map(o => o.optionName).join(", ")} - NAO REFAZER O PRODUTO` : `NOVO ITEM: ${product.name}${options.length ? ` - ${options.map(o => o.optionName).join(", ")}` : ""}`;
    const tabItem = await tx.tabItem.create({ data: { tabId: kitchen.tabId, addedById: actor.userId, productId: product.id, productName: description, quantity: input.quantity, sentQuantity: input.quantity, unitPrice: delta } });
    const supplement = await tx.order.create({ data: { tabId: kitchen.tabId, deliveryParentId: order.id, amendmentKey: input.idempotencyKey, sentById: actor.userId, items: { create: { tabItemId: tabItem.id, productName: description, quantity: input.quantity } }, statusHistory: { create: { status: "RECEIVED", actorId: actor.userId } } } });
    await tx.deliveryOrder.update({ where: { id: order.id }, data: { updatedAt: new Date() } });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, establishmentId: actor.establishmentId, actorId: actor.userId, action: "UPDATE", entityType: "DeliveryOrder", entityId: order.id, reason: "Acréscimo solicitado pelo cliente após o pedido", before: { itemId: item?.id ?? null, unitPrice: item ? Number(item.unitPrice) : null }, after: { mode: input.mode, quantity: input.quantity, amountAdded: round(delta * input.quantity), options, kitchenOrderId: supplement.id } } });
    return { kitchenOrderId: supplement.id, duplicate: false, amountAdded: round(delta * input.quantity) };
  }, { timeout: 15000 });
}
