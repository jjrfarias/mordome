import { CatalogChannel } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalCatalog } from "@/lib/local-catalog";

const querySchema = z.object({ channel: z.enum(CatalogChannel) });

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success || !["POS", "FLOOR"].includes(parsed.data.channel)) return Response.json({ error: "Canal inválido." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (parsed.data.channel === "POS" && !session.canSellPos) return Response.json({ error: "Acesso negado ao PDV." }, { status: 403 });
    if (parsed.data.channel === "FLOOR" && !session.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 });
    const products = listLocalCatalog(session.establishment.id)
      .filter(product => product.active && product.channels.includes(parsed.data.channel))
      .map(product => ({ ...product, ingredientGroups: product.ingredientGroups.filter(group => group.active).map(group => ({ ...group, options: group.options.filter(option => option.active) })) }));
    return Response.json({ products });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (parsed.data.channel === "POS" && !session.canSellPos) return Response.json({ error: "Acesso negado ao PDV." }, { status: 403 });
  if (parsed.data.channel === "FLOOR" && !session.canOperateFloor) return Response.json({ error: "Acesso negado ao salão." }, { status: 403 });
  const offerings = await db.productOffering.findMany({
    where: { establishmentId: session.establishment.id, channel: parsed.data.channel, active: true, variant: { active: true, product: { organizationId: session.organization.id, active: true } } },
    include: { variant: { include: { product: { include: { category: true, ingredientGroups: { where: { active: true }, include: { options: { where: { active: true } } } } } } } } },
    orderBy: [{ variant: { product: { category: { sortOrder: "asc" } } } }, { variant: { product: { name: "asc" } } }],
  });
  return Response.json({ products: offerings.map(offering => ({
    id: offering.variant.product.id,
    name: offering.variant.product.name,
    category: offering.variant.product.category?.name ?? "Sem categoria",
    price: Number(offering.price),
    active: true,
    imageUrl: offering.variant.product.imageUrl,
    ingredientGroups: offering.variant.product.ingredientGroups.map(group => ({ id: group.id, productId: group.productId, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active, options: group.options.map(option => ({ id: option.id, name: option.name, priceDelta: Number(option.priceDelta), active: option.active })) })),
  })) });
}
