import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalCatalog } from "@/lib/local-catalog";
import { listLocalInventory } from "@/lib/local-inventory";
import { createLocalRecipe, listLocalRecipes } from "@/lib/local-recipes";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";

const componentSchema = z.object({ inventoryItemId: z.string().min(1), quantity: z.number().finite().positive(), wastePercent: z.number().finite().min(0).max(100).default(0) });
const createSchema = z.object({ productId: z.string().min(1), name: z.string().trim().min(2).max(120), yieldQuantity: z.number().finite().positive().default(1), components: z.array(componentSchema).min(1) }).refine(data => new Set(data.components.map(component => component.inventoryItemId)).size === data.components.length, { message: "Não repita o mesmo item na receita." });

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
    return Response.json({ products: listLocalCatalog(session.establishment.id).map(product => ({ id: product.id, name: product.name })), inventoryItems: listLocalInventory(session.establishment.id).filter(item => item.configured).map(item => ({ id: item.id, name: item.name, baseUnit: item.baseUnit })), recipes: listLocalRecipes(session.establishment.id) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageRecipes) return Response.json({ error: "Acesso negado às fichas técnicas." }, { status: 403 });

  const [products, inventoryItems, recipes] = await Promise.all([
    db.product.findMany({ where: { organizationId: actor.session.organization.id, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.inventoryItem.findMany({ where: { organizationId: actor.session.organization.id, active: true, establishments: { some: { establishmentId: actor.session.establishment.id, active: true } } }, select: { id: true, name: true, baseUnit: true }, orderBy: { name: "asc" } }),
    db.recipe.findMany({ where: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, kind: "SALE", active: true }, include: { variant: { include: { product: true } }, components: { include: { inventoryItem: true } } }, orderBy: { name: "asc" } }),
  ]);
  return Response.json({ products, inventoryItems, recipes: recipes.map(recipe => ({ id: recipe.id, productId: recipe.variant?.product.id, productName: recipe.variant?.product.name ?? "Produto removido", name: recipe.name, yieldQuantity: Number(recipe.yieldQuantity), components: recipe.components.map(component => ({ inventoryItemId: component.inventoryItemId, inventoryItemName: component.inventoryItem.name, baseUnit: component.inventoryItem.baseUnit, quantity: Number(component.quantity), wastePercent: Number(component.wastePercent) })) })) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Ficha técnica inválida." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const product = listLocalCatalog(session.establishment.id).find(item => item.id === parsed.data.productId);
    const inventory = listLocalInventory(session.establishment.id);
    if (!product) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
    const components = parsed.data.components.map(component => { const item = inventory.find(candidate => candidate.id === component.inventoryItemId); return { ...component, inventoryItemName: item?.name ?? "Item desconhecido", baseUnit: item?.baseUnit ?? "UNIT" as const }; });
    if (components.some(component => component.inventoryItemName === "Item desconhecido")) return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
    const recipe = createLocalRecipe(session.establishment.id, { ...parsed.data, productName: product.name, components });
    if (!recipe) return Response.json({ error: "Este produto já possui ficha técnica nesta unidade." }, { status: 409 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "CREATE", entityType: "Recipe", entityId: recipe.id, reason: "Cadastro de ficha técnica", after: { ...parsed.data, productName: product.name, components }, ...requestAuditMetadata(request) });
    return Response.json({ recipe }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageRecipes) return Response.json({ error: "Acesso negado às fichas técnicas." }, { status: 403 });
  const data = parsed.data;
  const product = await db.product.findFirst({ where: { id: data.productId, organizationId: actor.session.organization.id }, include: { variants: { where: { isDefault: true }, take: 1 } } });
  const variant = product?.variants[0];
  if (!product || !variant) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  const inventoryCount = await db.inventoryItem.count({ where: { id: { in: data.components.map(component => component.inventoryItemId) }, organizationId: actor.session.organization.id, establishments: { some: { establishmentId: actor.session.establishment.id, active: true } } } });
  if (inventoryCount !== data.components.length) return Response.json({ error: "Um ou mais itens não pertencem ao estoque desta unidade." }, { status: 403 });
  if (await db.recipe.findFirst({ where: { variantId: variant.id, establishmentId: actor.session.establishment.id, kind: "SALE", active: true } })) return Response.json({ error: "Este produto já possui ficha técnica nesta unidade." }, { status: 409 });

  try {
    const recipe = await db.$transaction(async tx => {
      const created = await tx.recipe.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, variantId: variant.id, kind: "SALE", name: data.name, yieldQuantity: data.yieldQuantity, components: { create: data.components } } });
      await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "CREATE", entityType: "Recipe", entityId: created.id, reason: "Cadastro de ficha técnica", after: { productId: product.id, productName: product.name, name: data.name, yieldQuantity: data.yieldQuantity, components: data.components }, ...requestAuditMetadata(request) } });
      return created;
    });
    return Response.json({ recipe: { id: recipe.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "A ficha contém item repetido." }, { status: 409 });
    return Response.json({ error: "Não foi possível cadastrar a ficha técnica." }, { status: 500 });
  }
}
