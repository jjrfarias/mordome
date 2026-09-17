import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import {
  createLocalComboGroup,
  createLocalComboGroupOption,
  deleteLocalComboGroup,
  deleteLocalComboGroupOption,
  listLocalComboGroups,
  listLocalComboOptionCandidates,
  updateLocalComboGroup,
  updateLocalComboGroupOption,
} from "@/lib/local-catalog";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

// Combos (ADR 0054): mesmo desenho de app/api/admin/catalog/groups/route.ts (Grupos de
// ingrediente, ADR 0022), mas cada opção referencia outro Product (productId) em vez de um nome
// livre — o nome/disponibilidade da opção sempre vêm do produto referenciado, nunca duplicados.
const groupInputSchema = z.object({ name: z.string().trim().min(2).max(60), minSelections: z.number().int().min(0).max(20), maxSelections: z.number().int().min(1).max(20) }).refine(data => data.maxSelections >= data.minSelections, { message: "O máximo precisa ser maior ou igual ao mínimo." });
const optionInputSchema = z.object({ optionProductId: z.string().trim().min(1), priceDelta: z.number().finite().min(0).max(9999.99) });

const createGroupSchema = z.object({ action: z.literal("CREATE_GROUP"), productId: z.string().min(1) }).and(groupInputSchema);
const updateGroupSchema = z.object({ action: z.literal("UPDATE_GROUP"), productId: z.string().min(1), groupId: z.string().min(1), active: z.boolean().default(true) }).and(groupInputSchema);
const deleteGroupSchema = z.object({ action: z.literal("DELETE_GROUP"), productId: z.string().min(1), groupId: z.string().min(1) });
const createOptionSchema = z.object({ action: z.literal("CREATE_OPTION"), productId: z.string().min(1), groupId: z.string().min(1) }).and(optionInputSchema);
const updateOptionSchema = z.object({ action: z.literal("UPDATE_OPTION"), productId: z.string().min(1), groupId: z.string().min(1), optionId: z.string().min(1), active: z.boolean().default(true), priceDelta: z.number().finite().min(0).max(9999.99) });
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
    const groups = listLocalComboGroups(productId);
    if (groups === null) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
    return Response.json({ groups, candidates: listLocalComboOptionCandidates(productId) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
  const product = await db.product.findFirst({ where: { id: productId, organizationId: actor.session.organization.id } });
  if (!product) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  const [groups, candidates] = await Promise.all([
    db.comboGroup.findMany({ where: { productId }, include: { options: { include: { optionProduct: { select: { id: true, name: true, active: true } } } } }, orderBy: { createdAt: "asc" } }),
    db.product.findMany({ where: { organizationId: actor.session.organization.id, active: true, isCombo: false, id: { not: productId } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return Response.json({
    groups: groups.map(group => ({ ...group, options: group.options.map(option => ({ id: option.id, productId: option.productId, productName: option.optionProduct.name, priceDelta: Number(option.priceDelta), active: option.active && option.optionProduct.active })) })),
    candidates,
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos para grupo de combo." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
    const auditBase = { organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, ...requestAuditMetadata(request) };
    if (data.action === "CREATE_GROUP") {
      const group = createLocalComboGroup(data.productId, { name: data.name, minSelections: data.minSelections, maxSelections: data.maxSelections });
      if (!group) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
      recordLocalAudit({ ...auditBase, action: "CREATE", entityType: "ComboGroup", entityId: group.id, reason: "Criação de grupo de combo", after: group });
      return Response.json({ group }, { status: 201 });
    }
    if (data.action === "UPDATE_GROUP") {
      const group = updateLocalComboGroup(data.productId, data.groupId, { name: data.name, minSelections: data.minSelections, maxSelections: data.maxSelections, active: data.active });
      if (!group) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
      recordLocalAudit({ ...auditBase, action: "UPDATE", entityType: "ComboGroup", entityId: group.id, reason: "Atualização de grupo de combo", after: group });
      return Response.json({ group });
    }
    if (data.action === "DELETE_GROUP") {
      const ok = deleteLocalComboGroup(data.productId, data.groupId);
      if (!ok) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
      recordLocalAudit({ ...auditBase, action: "DELETE", entityType: "ComboGroup", entityId: data.groupId, reason: "Remoção de grupo de combo" });
      return Response.json({ ok: true });
    }
    if (data.action === "CREATE_OPTION") {
      const result = createLocalComboGroupOption(data.productId, data.groupId, { optionProductId: data.optionProductId, priceDelta: data.priceDelta });
      if (result === "GROUP_NOT_FOUND") return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
      if (result === "PRODUCT_NOT_FOUND") return Response.json({ error: "Produto inválido para compor o combo." }, { status: 400 });
      if (result === "DUPLICATE") return Response.json({ error: "Esse produto já está nesse grupo." }, { status: 409 });
      recordLocalAudit({ ...auditBase, action: "CREATE", entityType: "ComboGroupOption", entityId: result.id, reason: "Criação de opção de combo", after: result });
      return Response.json({ option: result }, { status: 201 });
    }
    if (data.action === "UPDATE_OPTION") {
      const option = updateLocalComboGroupOption(data.productId, data.groupId, data.optionId, { priceDelta: data.priceDelta, active: data.active });
      if (!option) return Response.json({ error: "Opção não encontrada." }, { status: 404 });
      recordLocalAudit({ ...auditBase, action: "UPDATE", entityType: "ComboGroupOption", entityId: option.id, reason: "Atualização de opção de combo", after: option });
      return Response.json({ option });
    }
    const ok = deleteLocalComboGroupOption(data.productId, data.groupId, data.optionId);
    if (!ok) return Response.json({ error: "Opção não encontrada." }, { status: 404 });
    recordLocalAudit({ ...auditBase, action: "DELETE", entityType: "ComboGroupOption", entityId: data.optionId, reason: "Remoção de opção de combo" });
    return Response.json({ ok: true });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });

  const product = await db.product.findFirst({ where: { id: data.productId, organizationId: actor.session.organization.id, isCombo: true } });
  if (!product) return Response.json({ error: "Produto não encontrado." }, { status: 404 });

  const auditBase = { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, ...requestAuditMetadata(request) };

  if (data.action === "CREATE_GROUP") {
    const group = await db.comboGroup.create({ data: { productId: data.productId, name: data.name, minSelections: data.minSelections, maxSelections: data.maxSelections } });
    await db.auditEvent.create({ data: { ...auditBase, action: "CREATE", entityType: "ComboGroup", entityId: group.id, reason: "Criação de grupo de combo", after: { name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections } } });
    return Response.json({ group: { ...group, options: [] } }, { status: 201 });
  }
  if (data.action === "UPDATE_GROUP") {
    const existing = await db.comboGroup.findFirst({ where: { id: data.groupId, productId: data.productId } });
    if (!existing) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
    const group = await db.comboGroup.update({ where: { id: data.groupId }, data: { name: data.name, minSelections: data.minSelections, maxSelections: data.maxSelections, active: data.active }, include: { options: { include: { optionProduct: { select: { name: true, active: true } } } } } });
    await db.auditEvent.create({ data: { ...auditBase, action: "UPDATE", entityType: "ComboGroup", entityId: group.id, reason: "Atualização de grupo de combo", before: { name: existing.name, minSelections: existing.minSelections, maxSelections: existing.maxSelections, active: existing.active }, after: { name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active } } });
    return Response.json({ group: { ...group, options: group.options.map(option => ({ id: option.id, productId: option.productId, productName: option.optionProduct.name, priceDelta: Number(option.priceDelta), active: option.active && option.optionProduct.active })) } });
  }
  if (data.action === "DELETE_GROUP") {
    const existing = await db.comboGroup.findFirst({ where: { id: data.groupId, productId: data.productId } });
    if (!existing) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
    await db.comboGroup.delete({ where: { id: data.groupId } });
    await db.auditEvent.create({ data: { ...auditBase, action: "DELETE", entityType: "ComboGroup", entityId: data.groupId, reason: "Remoção de grupo de combo" } });
    return Response.json({ ok: true });
  }
  if (data.action === "CREATE_OPTION") {
    const group = await db.comboGroup.findFirst({ where: { id: data.groupId, productId: data.productId } });
    if (!group) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
    const optionProduct = await db.product.findFirst({ where: { id: data.optionProductId, organizationId: actor.session.organization.id, active: true, isCombo: false } });
    if (!optionProduct) return Response.json({ error: "Produto inválido para compor o combo." }, { status: 400 });
    try {
      const option = await db.comboGroupOption.create({ data: { comboGroupId: data.groupId, productId: data.optionProductId, priceDelta: data.priceDelta } });
      await db.auditEvent.create({ data: { ...auditBase, action: "CREATE", entityType: "ComboGroupOption", entityId: option.id, reason: "Criação de opção de combo", after: { productName: optionProduct.name, priceDelta: Number(option.priceDelta) } } });
      return Response.json({ option: { id: option.id, productId: option.productId, productName: optionProduct.name, priceDelta: Number(option.priceDelta), active: option.active } }, { status: 201 });
    } catch {
      return Response.json({ error: "Esse produto já está nesse grupo." }, { status: 409 });
    }
  }
  if (data.action === "UPDATE_OPTION") {
    const existing = await db.comboGroupOption.findFirst({ where: { id: data.optionId, comboGroupId: data.groupId, comboGroup: { productId: data.productId } }, include: { optionProduct: { select: { name: true } } } });
    if (!existing) return Response.json({ error: "Opção não encontrada." }, { status: 404 });
    const option = await db.comboGroupOption.update({ where: { id: data.optionId }, data: { priceDelta: data.priceDelta, active: data.active } });
    await db.auditEvent.create({ data: { ...auditBase, action: "UPDATE", entityType: "ComboGroupOption", entityId: option.id, reason: "Atualização de opção de combo", before: { priceDelta: Number(existing.priceDelta), active: existing.active }, after: { priceDelta: Number(option.priceDelta), active: option.active } } });
    return Response.json({ option: { id: option.id, productId: option.productId, productName: existing.optionProduct.name, priceDelta: Number(option.priceDelta), active: option.active } });
  }
  const existing = await db.comboGroupOption.findFirst({ where: { id: data.optionId, comboGroupId: data.groupId, comboGroup: { productId: data.productId } } });
  if (!existing) return Response.json({ error: "Opção não encontrada." }, { status: 404 });
  await db.comboGroupOption.delete({ where: { id: data.optionId } });
  await db.auditEvent.create({ data: { ...auditBase, action: "DELETE", entityType: "ComboGroupOption", entityId: data.optionId, reason: "Remoção de opção de combo" } });
  return Response.json({ ok: true });
}
