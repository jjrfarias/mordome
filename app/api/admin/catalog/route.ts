import { CatalogChannel, MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { slugify } from "@/lib/auth-validation";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalCatalogProduct, listLocalCatalog, updateLocalCatalogProduct } from "@/lib/local-catalog";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";
import { compareAtPriceError, productImageUrlSchema as imageUrlSchema } from "@/lib/catalog-validation";

const channelSchema = z.enum(CatalogChannel);
const offeringSchema = z.object({
  price: z.number().finite().min(0).max(999999.99),
  channels: z.array(channelSchema).min(1).transform(channels => [...new Set(channels)]),
  imageUrl: imageUrlSchema.optional(),
  // ADR 0058: preço "de" (null remove) e marcação vegetariana para a vitrine.
  compareAtPrice: z.number().finite().min(0).max(999999.99).nullable().optional(),
  vegetarian: z.boolean().optional(),
});
const createSchema = offeringSchema.extend({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  isCombo: z.boolean().default(false),
});
// No PATCH, imageUrl ausente mantém a foto atual, string troca a foto e null remove a foto existente.
const patchSchema = offeringSchema.extend({ productId: z.string().trim().min(1), description: z.string().trim().max(500).optional(), imageUrl: imageUrlSchema.nullable().optional() });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  const membership = await db.organizationMembership.findFirst({
    where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE },
  });
  if (!membership) return null;
  return { session, membership };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    return Response.json({ products: listLocalCatalog(session.establishment.id) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });

  const products = await db.product.findMany({
    where: { organizationId: actor.session.organization.id },
    include: {
      category: { select: { name: true } },
      variants: {
        where: { isDefault: true },
        take: 1,
        include: { offerings: { where: { establishmentId: actor.session.establishment.id } } },
      },
    },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  return Response.json({
    products: products.map(product => {
      const variant = product.variants[0];
      const activeOfferings = variant?.offerings.filter(offering => offering.active) ?? [];
      return {
        id: product.id,
        name: product.name,
        category: product.category?.name ?? "Sem categoria",
        price: Number(activeOfferings[0]?.price ?? 0),
        compareAtPrice: activeOfferings[0]?.compareAtPrice != null ? Number(activeOfferings[0].compareAtPrice) : null,
        vegetarian: product.vegetarian,
        channels: activeOfferings.map(offering => offering.channel),
        active: product.active,
        imageUrl: product.imageUrl,
        isCombo: product.isCombo,
        description: product.description,
      };
    }),
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Confira nome, categoria, preço e canais." }, { status: 400 });
  const createCompareError = compareAtPriceError(parsed.data.price, parsed.data.compareAtPrice);
  if (createCompareError) return Response.json({ error: createCompareError }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const { name, category, description, price, channels, imageUrl, isCombo, vegetarian, compareAtPrice } = parsed.data;
    const product = createLocalCatalogProduct(session.establishment.id, { name, category, description, price, channels, imageUrl, isCombo, vegetarian, compareAtPrice });
    if (!product) return Response.json({ error: "Já existe um produto com esse nome." }, { status: 409 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "CREATE", entityType: "Product", entityId: product.id, reason: "Cadastro inicial de produto", after: parsed.data, ...requestAuditMetadata(request) });
    return Response.json({ product }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });

  const data = parsed.data;
  try {
    const product = await db.$transaction(async tx => {
      const category = await tx.category.upsert({
        where: { organizationId_slug: { organizationId: actor.session.organization.id, slug: slugify(data.category) } },
        update: { name: data.category, active: true },
        create: { organizationId: actor.session.organization.id, name: data.category, slug: slugify(data.category) },
      });
      const created = await tx.product.create({
        data: {
          organizationId: actor.session.organization.id,
          categoryId: category.id,
          name: data.name,
          slug: slugify(data.name),
          description: data.description || null,
          imageUrl: data.imageUrl ?? null,
          isCombo: data.isCombo,
          vegetarian: data.vegetarian ?? false,
          variants: {
            create: {
              name: "Padrão",
              isDefault: true,
              offerings: { create: data.channels.map(channel => ({ establishmentId: actor.session.establishment.id, channel, price: data.price, compareAtPrice: data.compareAtPrice ?? null })) },
            },
          },
        },
      });
      await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "CREATE", entityType: "Product", entityId: created.id, reason: "Cadastro inicial de produto", after: { name: data.name, category: data.category, price: data.price, compareAtPrice: data.compareAtPrice ?? null, vegetarian: data.vegetarian ?? false, channels: data.channels } } });
      return created;
    });
    return Response.json({ product: { id: product.id, ...data, active: product.active } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um produto com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível cadastrar o produto." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Confira preço e canais." }, { status: 400 });
  const patchCompareError = compareAtPriceError(parsed.data.price, parsed.data.compareAtPrice);
  if (patchCompareError) return Response.json({ error: patchCompareError }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const { price, channels, description, imageUrl, vegetarian, compareAtPrice } = parsed.data;
    const product = updateLocalCatalogProduct(session.establishment.id, parsed.data.productId, { price, channels, description, imageUrl, vegetarian, compareAtPrice });
    if (!product) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: session.establishment.id, establishmentName: session.establishment.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "UPDATE", entityType: "ProductOffering", entityId: product.id, reason: "Atualização de preço e canais", after: parsed.data, ...requestAuditMetadata(request) });
    return Response.json({ product });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageCatalog) return Response.json({ error: "Acesso negado ao Cardápio." }, { status: 403 });

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, organizationId: actor.session.organization.id },
    include: { variants: { where: { isDefault: true }, take: 1 } },
  });
  const variant = product?.variants[0];
  if (!product || !variant) return Response.json({ error: "Produto não encontrado." }, { status: 404 });

  await db.$transaction(async tx => {
    const previous = await tx.productOffering.findMany({ where: { establishmentId: actor.session.establishment.id, variantId: variant.id }, select: { channel: true, price: true, compareAtPrice: true, active: true } });
    for (const channel of Object.values(CatalogChannel)) {
      // Sem preço "de" no pedido, mantém o atual apenas se continuar maior que o novo preço (CHECK).
      const kept = previous.find(item => item.channel === channel)?.compareAtPrice;
      const compareAtPrice = parsed.data.compareAtPrice !== undefined ? parsed.data.compareAtPrice : kept != null && Number(kept) > parsed.data.price ? Number(kept) : null;
      await tx.productOffering.upsert({
        where: { establishmentId_variantId_channel: { establishmentId: actor.session.establishment.id, variantId: variant.id, channel } },
        update: { price: parsed.data.price, compareAtPrice, active: parsed.data.channels.includes(channel) },
        create: { establishmentId: actor.session.establishment.id, variantId: variant.id, channel, price: parsed.data.price, compareAtPrice, active: parsed.data.channels.includes(channel) },
      });
    }
    await tx.product.update({ where: { id: product.id }, data: { ...(parsed.data.vegetarian !== undefined ? { vegetarian: parsed.data.vegetarian } : {}), ...(parsed.data.imageUrl !== undefined ? { imageUrl: parsed.data.imageUrl } : {}), ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}) } });
    await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, establishmentId: actor.session.establishment.id, actorId: actor.session.user.id, action: "UPDATE", entityType: "ProductOffering", entityId: variant.id, reason: "Atualização de preço e canais", before: { offerings: previous.map(item => ({ ...item, price: Number(item.price), compareAtPrice: item.compareAtPrice != null ? Number(item.compareAtPrice) : null })), vegetarian: product.vegetarian }, after: { price: parsed.data.price, compareAtPrice: parsed.data.compareAtPrice, vegetarian: parsed.data.vegetarian, channels: parsed.data.channels }, ...requestAuditMetadata(request) } });
  });
  const finalImageUrl = parsed.data.imageUrl !== undefined ? parsed.data.imageUrl : product.imageUrl;
  return Response.json({ product: { id: product.id, name: product.name, description: parsed.data.description !== undefined ? parsed.data.description || null : product.description, price: parsed.data.price, compareAtPrice: parsed.data.compareAtPrice ?? null, vegetarian: parsed.data.vegetarian ?? product.vegetarian, channels: parsed.data.channels, active: product.active, imageUrl: finalImageUrl } });
}
