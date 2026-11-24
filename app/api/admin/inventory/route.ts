import { InventoryTrackingMode, InventoryUnit, MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { slugify } from "@/lib/auth-validation";
import { convertToBaseUnit, resolvePhysicalCountAdjustment } from "@/lib/inventory-domain";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { addLocalStockEntry, adjustLocalStock, applyLocalBulkPhysicalCount, archiveLocalInventoryItem, configureLocalInventoryItem, createLocalInventoryItem, defaultConversions, listLocalInventory, transferLocalStock } from "@/lib/local-inventory";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";
import { listLocalCatalog } from "@/lib/local-catalog";
import { archiveLocalSingleItemRecipes, createLocalRecipe, listLocalRecipes } from "@/lib/local-recipes";

const createSchema = z.object({ action: z.literal("CREATE_ITEM"), name: z.string().trim().min(2).max(100), baseUnit: z.enum(InventoryUnit), trackingMode: z.enum(InventoryTrackingMode), minimumStock: z.number().finite().min(0), allowNegative: z.boolean(), productId: z.string().min(1).optional() });
const configureSchema = z.object({ action: z.literal("CONFIGURE_ITEM"), inventoryItemId: z.string().min(1) });
const entrySchema = z.object({ action: z.literal("ENTRY"), establishmentItemId: z.string().min(1), quantity: z.number().finite().positive(), factorToBase: z.number().finite().positive(), totalCost: z.number().finite().min(0).optional(), idempotencyKey: z.string().uuid(), reason: z.string().trim().max(200).optional() });
const transferSchema = z.object({ action: z.literal("TRANSFER"), establishmentItemId: z.string().min(1), destinationEstablishmentId: z.string().min(1), quantity: z.number().finite().positive(), factorToBase: z.number().finite().positive(), idempotencyKey: z.string().uuid(), reason: z.string().trim().min(2).max(200) });
const adjustSchema = z.object({ action: z.literal("ADJUST"), establishmentItemId: z.string().min(1), kind: z.enum(["LOSS", "INTERNAL_CONSUMPTION", "PHYSICAL_COUNT"]), quantity: z.number().finite().min(0), factorToBase: z.number().finite().positive(), idempotencyKey: z.string().uuid(), reason: z.string().trim().min(3).max(200) });
const bulkPhysicalCountSchema = z.object({
  action: z.literal("BULK_PHYSICAL_COUNT"),
  reason: z.string().trim().min(3).max(200),
  idempotencyKey: z.string().uuid(),
  items: z.array(z.object({ establishmentItemId: z.string().min(1), countedQuantity: z.number().finite().min(0), factorToBase: z.number().finite().positive() })).min(1).max(500),
});
const actionSchema = z.discriminatedUnion("action", [createSchema, configureSchema, entrySchema, transferSchema, adjustSchema, bulkPhysicalCountSchema]);

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? { session, membership } : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const linked = new Set(listLocalRecipes(session.establishment.id).map(recipe => recipe.productId));
    return Response.json({ items: listLocalInventory(session.establishment.id), establishments: session.establishments.filter(item => item.id !== session.establishment.id), unlinkedProducts: listLocalCatalog(session.establishment.id).filter(product => !linked.has(product.id)).map(product => ({ id: product.id, name: product.name })) });
  }
  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });

  const [items, products] = await Promise.all([db.inventoryItem.findMany({
    where: { organizationId: actor.session.organization.id, active: true, establishments: { none: { establishmentId: actor.session.establishment.id, active: false } } },
    include: {
      conversions: true,
      establishments: { where: { establishmentId: actor.session.establishment.id }, include: { movements: { select: { quantity: true } } } },
    },
    orderBy: { name: "asc" },
  }), db.product.findMany({ where: { organizationId: actor.session.organization.id, active: true, variants: { some: { isDefault: true, offerings: { some: { establishmentId: actor.session.establishment.id, active: true } }, recipes: { none: { establishmentId: actor.session.establishment.id, kind: "SALE", active: true } } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  return Response.json({ establishments: actor.session.establishments.filter(item => item.id !== actor.session.establishment.id), unlinkedProducts: products, items: items.map(item => {
    const configuration = item.establishments[0];
    return { id: item.id, establishmentItemId: configuration?.id ?? null, name: item.name, baseUnit: item.baseUnit, active: item.active, configured: Boolean(configuration), trackingMode: configuration?.trackingMode ?? "AUTOMATIC", minimumStock: Number(configuration?.minimumStock ?? 0), allowNegative: configuration?.allowNegative ?? true, balance: configuration?.movements.reduce((sum, movement) => sum + Number(movement.quantity), 0) ?? 0, conversions: item.conversions.map(conversion => ({ name: conversion.name, symbol: conversion.symbol, factorToBase: Number(conversion.factorToBase) })) };
  }) });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = z.object({ inventoryItemId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Item inválido." }, { status: 400 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageStock || !session.canManageRecipes) return Response.json({ error: "Acesso negado." }, { status: 403 });
    if (listLocalRecipes(session.establishment.id).some(recipe => recipe.components.some(component => component.inventoryItemId === parsed.data.inventoryItemId) && recipe.components.length > 1)) return Response.json({ error: "Este item faz parte de uma ficha com outros ingredientes. Revise a ficha antes de excluir." }, { status: 409 });
    const result = archiveLocalInventoryItem(session.establishment.id, parsed.data.inventoryItemId);
    if (result === "NOT_FOUND") return Response.json({ error: "Item não encontrado nesta unidade." }, { status: 404 });
    if (result === "HAS_BALANCE") return Response.json({ error: "Zere o saldo por contagem física antes de excluir." }, { status: 409 });
    archiveLocalSingleItemRecipes(session.establishment.id, parsed.data.inventoryItemId);
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "DELETE", entityType: "InventoryItem", entityId: parsed.data.inventoryItemId, reason: "Exclusão do item de estoque nesta unidade", ...requestAuditMetadata(request) });
    return Response.json({ ok: true });
  }
  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageStock || !actor.session.canManageRecipes) return Response.json({ error: "Acesso negado." }, { status: 403 });
  try {
    await db.$transaction(async tx => {
      const item = await tx.establishmentInventoryItem.findFirst({ where: { establishmentId: actor.session.establishment.id, inventoryItemId: parsed.data.inventoryItemId, active: true, inventoryItem: { organizationId: actor.session.organization.id } }, include: { movements: { select: { quantity: true } } } });
      if (!item) throw new Error("NOT_FOUND");
      if (item.movements.reduce((total, movement) => total + Number(movement.quantity), 0) !== 0) throw new Error("HAS_BALANCE");
      const recipes = await tx.recipe.findMany({ where: { establishmentId: actor.session.establishment.id, active: true, components: { some: { inventoryItemId: parsed.data.inventoryItemId } } }, select: { id: true, components: { select: { id: true } } } });
      if (recipes.some(recipe => recipe.components.length > 1)) throw new Error("MULTI_RECIPE");
      await tx.recipe.updateMany({ where: { id: { in: recipes.map(recipe => recipe.id) } }, data: { active: false } });
      await tx.establishmentInventoryItem.update({ where: { id: item.id }, data: { active: false } });
      await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "DELETE", entityType: "InventoryItem", entityId: parsed.data.inventoryItemId, reason: "Exclusão do item de estoque nesta unidade", after: { archivedEstablishmentItemId: item.id, archivedRecipeIds: recipes.map(recipe => recipe.id) }, ...requestAuditMetadata(request) } });
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Item não encontrado nesta unidade." }, { status: 404 });
    if (error instanceof Error && error.message === "HAS_BALANCE") return Response.json({ error: "Zere o saldo por contagem física antes de excluir." }, { status: 409 });
    if (error instanceof Error && error.message === "MULTI_RECIPE") return Response.json({ error: "Este item faz parte de uma ficha com outros ingredientes. Revise a ficha antes de excluir." }, { status: 409 });
    return Response.json({ error: "Não foi possível excluir o item." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados de estoque inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const data = parsed.data;
    const localBase = { organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request) };
    if (data.action === "CREATE_ITEM" && data.productId) {
      if (!session.canManageRecipes) return Response.json({ error: "Acesso negado às fichas técnicas." }, { status: 403 });
      if (data.baseUnit !== "UNIT" || data.trackingMode !== "AUTOMATIC") return Response.json({ error: "Para vincular ao cardápio, escolha unidade e controle automático." }, { status: 400 });
      const product = listLocalCatalog(session.establishment.id).find(item => item.id === data.productId);
      if (!product) return Response.json({ error: "Produto do cardápio não encontrado nesta unidade." }, { status: 404 });
      if (listLocalRecipes(session.establishment.id).some(recipe => recipe.productId === product.id)) return Response.json({ error: "Este produto já possui ficha técnica nesta unidade." }, { status: 409 });
      const item = createLocalInventoryItem(session.establishment.id, data);
      if (!item) return Response.json({ error: "Já existe um item de estoque com esse nome." }, { status: 409 });
      createLocalRecipe(session.establishment.id, { productId: product.id, productName: product.name, name: product.name, yieldQuantity: 1, components: [{ inventoryItemId: item.id, inventoryItemName: item.name, baseUnit: "UNIT", quantity: 1, wastePercent: 0 }] });
      recordLocalAudit({ ...localBase, action: "CREATE", entityType: "InventoryItem", entityId: item.id, reason: "Cadastro de item de estoque vinculado ao cardápio", after: { ...data, productName: product.name } });
      return Response.json({ item }, { status: 201 });
    }
    if (data.action === "ADJUST") {
      if (!session.canAdjustStock) return Response.json({ error: "Você não tem permissão para ajustar o estoque." }, { status: 403 });
      const adjusted = adjustLocalStock({ ...data, establishmentId: session.establishment.id });
      if (adjusted === "NOT_FOUND") return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
      if (adjusted === "DUPLICATE") return Response.json({ error: "Este ajuste já foi registrado." }, { status: 409 });
      if (adjusted === "INSUFFICIENT_STOCK") return Response.json({ error: "O ajuste deixaria o estoque negativo." }, { status: 409 });
      recordLocalAudit({ ...localBase, action: "STOCK_ADJUST", entityType: "StockMovement", entityId: data.establishmentItemId, reason: data.reason, after: { kind: data.kind, ...adjusted } });
      return Response.json({ movement: adjusted }, { status: 201 });
    }
    if (data.action === "BULK_PHYSICAL_COUNT") {
      if (!session.canAdjustStock) return Response.json({ error: "Você não tem permissão para ajustar o estoque." }, { status: 403 });
      const result = applyLocalBulkPhysicalCount(session.establishment.id, data.items, data.idempotencyKey, data.reason);
      if (result === "DUPLICATE") return Response.json({ error: "Esta contagem já foi registrada." }, { status: 409 });
      if (typeof result === "object" && "failedEstablishmentItemId" in result) {
        const message = result.reason === "NOT_FOUND" ? `Item de estoque "${result.failedEstablishmentItemId}" não encontrado nesta unidade.` : `Não foi possível ajustar o item ${result.failedEstablishmentItemId}: o ajuste deixaria o estoque negativo.`;
        return Response.json({ error: message }, { status: result.reason === "NOT_FOUND" ? 404 : 409 });
      }
      for (const movement of result) {
        recordLocalAudit({ ...localBase, action: "STOCK_ADJUST", entityType: "StockMovement", entityId: movement.establishmentItemId, reason: data.reason, after: { kind: "PHYSICAL_COUNT", delta: movement.delta, balance: movement.balance } });
      }
      return Response.json({ movements: result }, { status: 201 });
    }
    if (data.action === "TRANSFER") {
      if (!session.establishments.some(item => item.id === data.destinationEstablishmentId)) return Response.json({ error: "Unidade de destino não autorizada." }, { status: 403 });
      const transfer = transferLocalStock({ ...data, sourceEstablishmentId: session.establishment.id });
      if (transfer === "INSUFFICIENT_STOCK") return Response.json({ error: "Saldo insuficiente para esta transferência." }, { status: 409 });
      if (transfer === "SAME_ESTABLISHMENT") return Response.json({ error: "Escolha outra unidade para receber o estoque." }, { status: 400 });
      if (transfer === "DUPLICATE") return Response.json({ error: "Esta transferência já foi registrada." }, { status: 409 });
      if (transfer === "NOT_FOUND") return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
      recordLocalAudit({ ...localBase, action: "STOCK_TRANSFER", entityType: "InventoryItem", entityId: data.establishmentItemId, reason: data.reason, after: { destinationEstablishmentId: data.destinationEstablishmentId, quantity: data.quantity, factorToBase: data.factorToBase } });
      return Response.json({ transfer }, { status: 201 });
    }
    const result = data.action === "CREATE_ITEM" ? createLocalInventoryItem(session.establishment.id, data) : data.action === "CONFIGURE_ITEM" ? configureLocalInventoryItem(session.establishment.id, data.inventoryItemId) : addLocalStockEntry(session.establishment.id, data.establishmentItemId, data.quantity, data.factorToBase, data.reason, data.totalCost);
    if (!result) return Response.json({ error: data.action === "CREATE_ITEM" ? "Já existe um item com esse nome." : "Item de estoque não encontrado." }, { status: data.action === "CREATE_ITEM" ? 409 : 404 });
    recordLocalAudit({ ...localBase, action: data.action === "ENTRY" ? "STOCK_ENTRY" : data.action === "CONFIGURE_ITEM" ? "STOCK_CONFIGURE" : "CREATE", entityType: data.action === "ENTRY" ? "StockMovement" : "InventoryItem", entityId: result.id, reason: data.action === "ENTRY" ? data.reason ?? "Entrada de estoque" : data.action === "CONFIGURE_ITEM" ? "Item habilitado na unidade" : "Cadastro de item de estoque", after: data });
    return Response.json({ item: result }, { status: data.action === "CREATE_ITEM" ? 201 : 200 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
  const data = parsed.data;

  if (data.action === "ADJUST") {
    if (!actor.session.canAdjustStock) return Response.json({ error: "Você não tem permissão para ajustar o estoque." }, { status: 403 });
    try {
      const result = await db.$transaction(async tx => {
        const item = await tx.establishmentInventoryItem.findFirst({ where: { id: data.establishmentItemId, establishmentId: actor.session.establishment.id, active: true }, include: { movements: { select: { quantity: true } } } });
        if (!item) throw new Error("ADJUST_ITEM_NOT_FOUND");
        const balance = item.movements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
        let delta: number;
        if (data.kind === "PHYSICAL_COUNT") {
          const outcome = resolvePhysicalCountAdjustment({ countedQuantity: data.quantity, factorToBase: data.factorToBase, balance, allowNegative: item.allowNegative });
          if (!outcome.ok) throw new Error("ADJUST_INSUFFICIENT_STOCK");
          delta = outcome.delta;
        } else {
          delta = -convertToBaseUnit(data.quantity, data.factorToBase);
          if (!item.allowNegative && balance + delta < 0) throw new Error("ADJUST_INSUFFICIENT_STOCK");
        }
        const movement = await tx.stockMovement.create({ data: { establishmentItemId: item.id, type: data.kind === "LOSS" ? "LOSS" : data.kind === "INTERNAL_CONSUMPTION" ? "CONSUMPTION" : "ADJUSTMENT", quantity: delta, actorId: actor.session.user.id, sourceType: data.kind, reason: data.reason, idempotencyKey: data.idempotencyKey } });
        await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "STOCK_ADJUST", entityType: "StockMovement", entityId: movement.id, reason: data.reason, before: { balance }, after: { kind: data.kind, quantity: delta, balance: balance + delta }, ...requestAuditMetadata(request) } });
        return movement;
      });
      return Response.json({ movement: { id: result.id, quantity: Number(result.quantity) } }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === "ADJUST_ITEM_NOT_FOUND") return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
      if (error instanceof Error && error.message === "ADJUST_INSUFFICIENT_STOCK") return Response.json({ error: "O ajuste deixaria o estoque negativo." }, { status: 409 });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Este ajuste já foi registrado." }, { status: 409 });
      return Response.json({ error: "Não foi possível ajustar o estoque." }, { status: 500 });
    }
  }

  if (data.action === "BULK_PHYSICAL_COUNT") {
    if (!actor.session.canAdjustStock) return Response.json({ error: "Você não tem permissão para ajustar o estoque." }, { status: 403 });
    try {
      const movements = await db.$transaction(async tx => {
        const created: { id: string; establishmentItemId: string; quantity: number }[] = [];
        for (const entry of data.items) {
          const item = await tx.establishmentInventoryItem.findFirst({ where: { id: entry.establishmentItemId, establishmentId: actor.session.establishment.id, active: true, inventoryItem: { organizationId: actor.session.organization.id } }, include: { movements: { select: { quantity: true } } } });
          if (!item) throw new Error(`BULK_ITEM_NOT_FOUND:${entry.establishmentItemId}`);
          const balance = item.movements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
          const outcome = resolvePhysicalCountAdjustment({ countedQuantity: entry.countedQuantity, factorToBase: entry.factorToBase, balance, allowNegative: item.allowNegative });
          if (!outcome.ok) throw new Error(`BULK_INSUFFICIENT_STOCK:${entry.establishmentItemId}`);
          if (outcome.delta === 0) continue;
          const movement = await tx.stockMovement.create({ data: { establishmentItemId: item.id, type: "ADJUSTMENT", quantity: outcome.delta, actorId: actor.session.user.id, sourceType: "PHYSICAL_COUNT", reason: data.reason, idempotencyKey: `${data.idempotencyKey}:${entry.establishmentItemId}` } });
          await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "STOCK_ADJUST", entityType: "StockMovement", entityId: movement.id, reason: data.reason, before: { balance }, after: { kind: "PHYSICAL_COUNT", quantity: outcome.delta, balance: outcome.newBalance }, ...requestAuditMetadata(request) } });
          created.push({ id: movement.id, establishmentItemId: entry.establishmentItemId, quantity: Number(movement.quantity) });
        }
        return created;
      });
      return Response.json({ movements }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("BULK_ITEM_NOT_FOUND:")) return Response.json({ error: `Item de estoque não encontrado: ${error.message.split(":")[1]}` }, { status: 404 });
      if (error instanceof Error && error.message.startsWith("BULK_INSUFFICIENT_STOCK:")) return Response.json({ error: `O ajuste deixaria o estoque negativo para o item ${error.message.split(":")[1]}.` }, { status: 409 });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Esta contagem já foi registrada." }, { status: 409 });
      return Response.json({ error: "Não foi possível aplicar a contagem de estoque." }, { status: 500 });
    }
  }

  try {
    if (data.action === "CREATE_ITEM") {
      if (data.productId && !actor.session.canManageRecipes) return Response.json({ error: "Acesso negado às fichas técnicas." }, { status: 403 });
      if (data.productId && (data.baseUnit !== "UNIT" || data.trackingMode !== "AUTOMATIC")) return Response.json({ error: "Para vincular ao cardápio, escolha unidade e controle automático." }, { status: 400 });
      const item = await db.$transaction(async tx => {
        const product = data.productId ? await tx.product.findFirst({ where: { id: data.productId, organizationId: actor.session.organization.id, active: true }, select: { id: true, name: true, variants: { where: { isDefault: true }, take: 1, select: { id: true, offerings: { where: { establishmentId: actor.session.establishment.id, active: true }, take: 1, select: { id: true } }, recipes: { where: { establishmentId: actor.session.establishment.id, kind: "SALE" }, take: 1, select: { id: true, active: true } } } } } }) : null;
        if (data.productId && (!product?.variants[0]?.offerings.length || product.variants[0].recipes.some(recipe => recipe.active))) throw new Error("PRODUCT_NOT_AVAILABLE");
        const created = await tx.inventoryItem.create({ data: { organizationId: actor.session.organization.id, name: data.name, slug: slugify(data.name), baseUnit: data.baseUnit, conversions: { create: defaultConversions(data.baseUnit) } } });
        await tx.establishmentInventoryItem.create({ data: { establishmentId: actor.session.establishment.id, inventoryItemId: created.id, trackingMode: data.trackingMode, minimumStock: data.minimumStock, allowNegative: data.allowNegative } });
        if (product) {
          const oldRecipe = product.variants[0].recipes[0];
          if (oldRecipe) await tx.recipe.update({ where: { id: oldRecipe.id }, data: { active: true, name: product.name, yieldQuantity: 1, components: { deleteMany: {}, create: [{ inventoryItemId: created.id, quantity: 1, wastePercent: 0 }] } } });
          else await tx.recipe.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, variantId: product.variants[0].id, kind: "SALE", name: product.name, yieldQuantity: 1, components: { create: [{ inventoryItemId: created.id, quantity: 1, wastePercent: 0 }] } } });
        }
        await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "CREATE", entityType: "InventoryItem", entityId: created.id, reason: data.productId ? "Cadastro de item de estoque vinculado ao cardápio" : "Cadastro de item de estoque", after: { name: data.name, baseUnit: data.baseUnit, trackingMode: data.trackingMode, productId: data.productId ?? null } } });
        return created;
      });
      return Response.json({ item: { id: item.id } }, { status: 201 });
    }
    if (data.action === "CONFIGURE_ITEM") {
      const item = await db.inventoryItem.findFirst({ where: { id: data.inventoryItemId, organizationId: actor.session.organization.id } });
      if (!item) return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
      const configured = await db.$transaction(async tx => { const record = await tx.establishmentInventoryItem.upsert({ where: { establishmentId_inventoryItemId: { establishmentId: actor.session.establishment.id, inventoryItemId: item.id } }, update: { active: true }, create: { establishmentId: actor.session.establishment.id, inventoryItemId: item.id } }); await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "STOCK_CONFIGURE", entityType: "InventoryItem", entityId: item.id, reason: "Item habilitado na unidade", after: { establishmentInventoryItemId: record.id, active: true }, ...requestAuditMetadata(request) } }); return record; });
      return Response.json({ item: { id: item.id, establishmentItemId: configured.id } });
    }

    if (data.action === "TRANSFER") {
      if (data.destinationEstablishmentId === actor.session.establishment.id) return Response.json({ error: "Escolha outra unidade para receber o estoque." }, { status: 400 });
      if (!actor.session.establishments.some(item => item.id === data.destinationEstablishmentId)) return Response.json({ error: "Unidade de destino não autorizada." }, { status: 403 });
      const baseQuantity = convertToBaseUnit(data.quantity, data.factorToBase);
      const transfer = await db.$transaction(async tx => {
        const source = await tx.establishmentInventoryItem.findFirst({ where: { id: data.establishmentItemId, establishmentId: actor.session.establishment.id, active: true, inventoryItem: { organizationId: actor.session.organization.id } }, include: { movements: { select: { quantity: true, unitCost: true } } } });
        if (!source) throw new Error("TRANSFER_ITEM_NOT_FOUND");
        const balance = source.movements.reduce((total, movement) => total + Number(movement.quantity), 0);
        if (baseQuantity > balance) throw new Error("TRANSFER_INSUFFICIENT_STOCK");
        const destinationEstablishment = await tx.establishment.findFirst({ where: { id: data.destinationEstablishmentId, organizationId: actor.session.organization.id, active: true } });
        if (!destinationEstablishment) throw new Error("TRANSFER_DESTINATION_NOT_FOUND");
        const destination = await tx.establishmentInventoryItem.upsert({ where: { establishmentId_inventoryItemId: { establishmentId: destinationEstablishment.id, inventoryItemId: source.inventoryItemId } }, update: { active: true }, create: { establishmentId: destinationEstablishment.id, inventoryItemId: source.inventoryItemId, trackingMode: source.trackingMode, minimumStock: source.minimumStock, allowNegative: source.allowNegative } });
        const valuedMovements = source.movements.filter(movement => movement.unitCost !== null);
        const stockValue = valuedMovements.reduce((total, movement) => total + Number(movement.quantity) * Number(movement.unitCost), 0);
        const unitCost = balance > 0 && valuedMovements.length > 0 ? (stockValue / balance).toFixed(4) : undefined;
        const transferReference = data.idempotencyKey;
        const [outMovement, inMovement] = await Promise.all([
          tx.stockMovement.create({ data: { establishmentItemId: source.id, type: "TRANSFER_OUT", quantity: -baseQuantity, unitCost, actorId: actor.session.user.id, sourceType: "STOCK_TRANSFER", sourceId: transferReference, reason: data.reason, idempotencyKey: `${transferReference}:out` } }),
          tx.stockMovement.create({ data: { establishmentItemId: destination.id, type: "TRANSFER_IN", quantity: baseQuantity, unitCost, actorId: actor.session.user.id, sourceType: "STOCK_TRANSFER", sourceId: transferReference, reason: data.reason, idempotencyKey: `${transferReference}:in` } }),
        ]);
        await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "STOCK_TRANSFER", entityType: "InventoryItem", entityId: source.inventoryItemId, reason: data.reason, after: { destinationEstablishmentId: destinationEstablishment.id, quantity: baseQuantity, outMovementId: outMovement.id, inMovementId: inMovement.id } } });
        return { quantity: baseQuantity, destinationEstablishmentId: destinationEstablishment.id };
      });
      return Response.json({ transfer }, { status: 201 });
    }

    const establishmentItem = await db.establishmentInventoryItem.findFirst({ where: { id: data.establishmentItemId, establishmentId: actor.session.establishment.id, inventoryItem: { organizationId: actor.session.organization.id } } });
    if (!establishmentItem) return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
    const baseQuantity = convertToBaseUnit(data.quantity, data.factorToBase);
    const unitCost = data.totalCost === undefined ? undefined : (data.totalCost / baseQuantity).toFixed(4);
    const movement = await db.$transaction(async tx => { const record = await tx.stockMovement.create({ data: { establishmentItemId: establishmentItem.id, type: "ENTRY", quantity: baseQuantity, unitCost, actorId: actor.session.user.id, reason: data.reason ?? "Entrada de estoque", sourceType: "MANUAL_ENTRY", idempotencyKey: data.idempotencyKey } }); await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "STOCK_ENTRY", entityType: "StockMovement", entityId: record.id, reason: data.reason ?? "Entrada de estoque", after: { inventoryItemId: establishmentItem.inventoryItemId, quantity: baseQuantity, unitCost, totalCost: data.totalCost }, ...requestAuditMetadata(request) } }); return record; });
    return Response.json({ movement: { id: movement.id, quantity: Number(movement.quantity) } }, { status: 201 });
  } catch (error) {
      if (error instanceof Error && error.message === "PRODUCT_NOT_AVAILABLE") return Response.json({ error: "Produto do cardápio indisponível ou já vinculado nesta unidade." }, { status: 409 });
    if (error instanceof Error && error.message === "TRANSFER_INSUFFICIENT_STOCK") return Response.json({ error: "Saldo insuficiente para esta transferência." }, { status: 409 });
    if (error instanceof Error && error.message === "TRANSFER_ITEM_NOT_FOUND") return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
    if (error instanceof Error && error.message === "TRANSFER_DESTINATION_NOT_FOUND") return Response.json({ error: "Unidade de destino não encontrada." }, { status: 404 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: data.action === "ENTRY" ? "Esta entrada já foi registrada." : data.action === "TRANSFER" ? "Esta transferência já foi registrada." : "Já existe um item com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar o estoque." }, { status: 500 });
  }
}
