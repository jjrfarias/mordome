import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalIngredientGroup, createLocalIngredientOption, listLocalIngredientGroups } from "@/lib/local-catalog";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priceDelta: z.number().finite().min(0).max(9999.99),
  productIds: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Informe nome, preço e ao menos um produto." }, { status: 400 });
  const { name, priceDelta, productIds } = parsed.data;
  if (new Set(productIds).size !== productIds.length) return Response.json({ error: "Há produtos repetidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
    const groupsByProduct = productIds.map(productId => ({ productId, groups: listLocalIngredientGroups(productId) }));
    if (groupsByProduct.some(item => !item.groups)) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
    if (groupsByProduct.some(item => item.groups?.some(group => group.name.toLocaleLowerCase("pt-BR") === "adicionais" && group.options.some(option => option.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))))) return Response.json({ error: "Esse adicional já existe em um dos produtos selecionados." }, { status: 409 });
    for (const item of groupsByProduct) {
      const group = item.groups!.find(group => group.active && group.name.toLocaleLowerCase("pt-BR") === "adicionais") ?? createLocalIngredientGroup(item.productId, { name: "Adicionais", minSelections: 0, maxSelections: 20 });
      if (!group) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
      createLocalIngredientOption(item.productId, group.id, { name, priceDelta });
    }
    return Response.json({ count: productIds.length }, { status: 201 });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  if (!membership || !session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });
  const products = await db.product.findMany({ where: { id: { in: productIds }, organizationId: session.organization.id, active: true, isCombo: false }, select: { id: true } });
  if (products.length !== productIds.length) return Response.json({ error: "Um dos produtos não foi encontrado." }, { status: 404 });
  const existing = await db.ingredientOption.findFirst({ where: { name: { equals: name, mode: "insensitive" }, group: { productId: { in: productIds }, name: { equals: "Adicionais", mode: "insensitive" } } } });
  if (existing) return Response.json({ error: "Esse adicional já existe em um dos produtos selecionados." }, { status: 409 });
  await db.$transaction(async tx => {
    for (const productId of productIds) {
      let group = await tx.ingredientGroup.findFirst({ where: { productId, active: true, name: { equals: "Adicionais", mode: "insensitive" } }, orderBy: { createdAt: "asc" } });
      if (!group) group = await tx.ingredientGroup.create({ data: { productId, name: "Adicionais", minSelections: 0, maxSelections: 20 } });
      await tx.ingredientOption.create({ data: { groupId: group.id, name, priceDelta } });
    }
  });
  return Response.json({ count: productIds.length }, { status: 201 });
}
