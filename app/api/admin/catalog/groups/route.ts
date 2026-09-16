import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import {
  createLocalIngredientGroup,
  createLocalIngredientOption,
  deleteLocalIngredientGroup,
  deleteLocalIngredientOption,
  listLocalIngredientGroups,
  updateLocalIngredientGroup,
  updateLocalIngredientOption,
} from "@/lib/local-catalog";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const groupInputSchema = z.object({ name: z.string().trim().min(2).max(60), minSelections: z.number().int().min(0).max(20), maxSelections: z.number().int().min(1).max(20) }).refine(data => data.maxSelections >= data.minSelections, { message: "O máximo precisa ser maior ou igual ao mínimo." });
const optionInputSchema = z.object({ name: z.string().trim().min(1).max(60), priceDelta: z.number().finite().min(0).max(9999.99) });

const createGroupSchema = z.object({ action: z.literal("CREATE_GROUP"), productId: z.string().min(1) }).and(groupInputSchema);
const updateGroupSchema = z.object({ action: z.literal("UPDATE_GROUP"), productId: z.string().min(1), groupId: z.string().min(1), active: z.boolean().default(true) }).and(groupInputSchema);
const deleteGroupSchema = z.object({ action: z.literal("DELETE_GROUP"), productId: z.string().min(1), groupId: z.string().min(1) });
const createOptionSchema = z.object({ action: z.literal("CREATE_OPTION"), productId: z.string().min(1), groupId: z.string().min(1) }).and(optionInputSchema);
const updateOptionSchema = z.object({ action: z.literal("UPDATE_OPTION"), productId: z.string().min(1), groupId: z.string().min(1), optionId: z.string().min(1), active: z.boolean().default(true) }).and(optionInputSchema);
const deleteOptionSchema = z.object({ action: z.literal("DELETE_OPTION"), productId: z.string().min(1), groupId: z.string().min(1), optionId: z.string().min(1) });

const actionSchema = z.union([createGroupSchema, updateGroupSchema, deleteGroupSchema, createOptionSchema, updateOptionSchema, deleteOptionSchema]);

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? { session, membership } : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const productId = new URL(request.url).searchParams.get("productId");
  if (!productId) return Response.json({ error: "Informe o produto." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const groups = listLocalIngredientGroups(productId);
    if (groups === null) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
    return Response.json({ groups });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
  const product = await db.product.findFirst({ where: { id: productId, organizationId: actor.session.organization.id } });
  if (!product) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  const groups = await db.ingredientGroup.findMany({ where: { productId }, include: { options: true }, orderBy: { createdAt: "asc" } });
  return Response.json({ groups: groups.map(group => ({ ...group, options: group.options.map(option => ({ ...option, priceDelta: Number(option.priceDelta) })) })) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos para grupo de ingredientes." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
    const auditBase = { organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request) };
    if (data.action === "CREATE_GROUP") {
      const group = createLocalIngredientGroup(data.productId, { name: data.name, minSelections: data.minSelections, maxSelections: data.maxSelections });
      if (!group) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
      recordLocalAudit({ ...auditBase, action: "CREATE", entityType: "IngredientGroup", entityId: group.id, reason: "Criação de grupo de ingrediente", after: group });
      return Response.json({ group }, { status: 201 });
    }
    if (data.action === "UPDATE_GROUP") {
      const group = updateLocalIngredientGroup(data.productId, data.groupId, { name: data.name, minSelections: data.minSelections, maxSelections: data.maxSelections, active: data.active });
      if (!group) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
      recordLocalAudit({ ...auditBase, action: "UPDATE", entityType: "IngredientGroup", entityId: group.id, reason: "Atualização de grupo de ingrediente", after: group });
      return Response.json({ group });
    }
    if (data.action === "DELETE_GROUP") {
      const ok = deleteLocalIngredientGroup(data.productId, data.groupId);
      if (!ok) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
      recordLocalAudit({ ...auditBase, action: "DELETE", entityType: "IngredientGroup", entityId: data.groupId, reason: "Remoção de grupo de ingrediente" });
      return Response.json({ ok: true });
    }
    if (data.action === "CREATE_OPTION") {
      const option = createLocalIngredientOption(data.productId, data.groupId, { name: data.name, priceDelta: data.priceDelta });
      if (!option) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
      recordLocalAudit({ ...auditBase, action: "CREATE", entityType: "IngredientOption", entityId: option.id, reason: "Criação de opção de ingrediente", after: option });
      return Response.json({ option }, { status: 201 });
    }
    if (data.action === "UPDATE_OPTION") {
      const option = updateLocalIngredientOption(data.productId, data.groupId, data.optionId, { name: data.name, priceDelta: data.priceDelta, active: data.active });
      if (!option) return Response.json({ error: "Opção não encontrada." }, { status: 404 });
      recordLocalAudit({ ...auditBase, action: "UPDATE", entityType: "IngredientOption", entityId: option.id, reason: "Atualização de opção de ingrediente", after: option });
      return Response.json({ option });
    }
    const ok = deleteLocalIngredientOption(data.productId, data.groupId, data.optionId);
    if (!ok) return Response.json({ error: "Opção não encontrada." }, { status: 404 });
    recordLocalAudit({ ...auditBase, action: "DELETE", entityType: "IngredientOption", entityId: data.optionId, reason: "Remoção de opção de ingrediente" });
    return Response.json({ ok: true });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });

  const product = await db.product.findFirst({ where: { id: data.productId, organizationId: actor.session.organization.id } });
  if (!product) return Response.json({ error: "Produto não encontrado." }, { status: 404 });

  const auditBase = { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, ...requestAuditMetadata(request) };

  if (data.action === "CREATE_GROUP") {
    const group = await db.ingredientGroup.create({ data: { productId: data.productId, name: data.name, minSelections: data.minSelections, maxSelections: data.maxSelections } });
    await db.auditEvent.create({ data: { ...auditBase, action: "CREATE", entityType: "IngredientGroup", entityId: group.id, reason: "Criação de grupo de ingrediente", after: { name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections } } });
    return Response.json({ group: { ...group, options: [] } }, { status: 201 });
  }
  if (data.action === "UPDATE_GROUP") {
    const existing = await db.ingredientGroup.findFirst({ where: { id: data.groupId, productId: data.productId } });
    if (!existing) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
    const group = await db.ingredientGroup.update({ where: { id: data.groupId }, data: { name: data.name, minSelections: data.minSelections, maxSelections: data.maxSelections, active: data.active }, include: { options: true } });
    await db.auditEvent.create({ data: { ...auditBase, action: "UPDATE", entityType: "IngredientGroup", entityId: group.id, reason: "Atualização de grupo de ingrediente", before: { name: existing.name, minSelections: existing.minSelections, maxSelections: existing.maxSelections, active: existing.active }, after: { name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active } } });
    return Response.json({ group: { ...group, options: group.options.map(option => ({ ...option, priceDelta: Number(option.priceDelta) })) } });
  }
  if (data.action === "DELETE_GROUP") {
    const existing = await db.ingredientGroup.findFirst({ where: { id: data.groupId, productId: data.productId } });
    if (!existing) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
    await db.ingredientGroup.delete({ where: { id: data.groupId } });
    await db.auditEvent.create({ data: { ...auditBase, action: "DELETE", entityType: "IngredientGroup", entityId: data.groupId, reason: "Remoção de grupo de ingrediente" } });
    return Response.json({ ok: true });
  }
  if (data.action === "CREATE_OPTION") {
    const group = await db.ingredientGroup.findFirst({ where: { id: data.groupId, productId: data.productId } });
    if (!group) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
    const option = await db.ingredientOption.create({ data: { groupId: data.groupId, name: data.name, priceDelta: data.priceDelta } });
    await db.auditEvent.create({ data: { ...auditBase, action: "CREATE", entityType: "IngredientOption", entityId: option.id, reason: "Criação de opção de ingrediente", after: { name: option.name, priceDelta: Number(option.priceDelta) } } });
    return Response.json({ option: { ...option, priceDelta: Number(option.priceDelta) } }, { status: 201 });
  }
  if (data.action === "UPDATE_OPTION") {
    const existing = await db.ingredientOption.findFirst({ where: { id: data.optionId, groupId: data.groupId, group: { productId: data.productId } } });
    if (!existing) return Response.json({ error: "Opção não encontrada." }, { status: 404 });
    const option = await db.ingredientOption.update({ where: { id: data.optionId }, data: { name: data.name, priceDelta: data.priceDelta, active: data.active } });
    await db.auditEvent.create({ data: { ...auditBase, action: "UPDATE", entityType: "IngredientOption", entityId: option.id, reason: "Atualização de opção de ingrediente", before: { name: existing.name, priceDelta: Number(existing.priceDelta), active: existing.active }, after: { name: option.name, priceDelta: Number(option.priceDelta), active: option.active } } });
    return Response.json({ option: { ...option, priceDelta: Number(option.priceDelta) } });
  }
  const existing = await db.ingredientOption.findFirst({ where: { id: data.optionId, groupId: data.groupId, group: { productId: data.productId } } });
  if (!existing) return Response.json({ error: "Opção não encontrada." }, { status: 404 });
  await db.ingredientOption.delete({ where: { id: data.optionId } });
  await db.auditEvent.create({ data: { ...auditBase, action: "DELETE", entityType: "IngredientOption", entityId: data.optionId, reason: "Remoção de opção de ingrediente" } });
  return Response.json({ ok: true });
}
