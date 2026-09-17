import { db } from "@/lib/db";
import { isLocalAuthEnabled, listLocalEstablishments } from "@/lib/local-auth";
import { listLocalCatalog } from "@/lib/local-catalog";

export async function GET(_request: Request, { params }: { params: Promise<{ establishmentId: string }> }) {
  const { establishmentId } = await params;

  if (isLocalAuthEnabled()) {
    const establishment = listLocalEstablishments().find(item => item.id === establishmentId && item.active);
    if (!establishment) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    const catalog = listLocalCatalog(establishmentId);
    const products = catalog.filter(product => product.active && product.channels.includes("ONLINE"));
    const highlightProduct = establishment.highlightProductId ? catalog.find(product => product.id === establishment.highlightProductId) : undefined;
    return Response.json({
      establishment: { name: establishment.name, logoUrl: establishment.logoUrl, bannerUrl: establishment.bannerUrl, highlightHeadline: establishment.highlightHeadline, highlightProduct: highlightProduct ? { id: highlightProduct.id, name: highlightProduct.name, price: highlightProduct.price, imageUrl: highlightProduct.imageUrl } : null },
      products: products.map(product => ({ id: product.id, name: product.name, category: product.category, description: null, price: product.price, imageUrl: product.imageUrl })),
    });
  }

  const establishment = await db.establishment.findFirst({ where: { id: establishmentId, active: true, organization: { active: true } }, include: { highlightProduct: true } });
  if (!establishment) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });

  const offerings = await db.productOffering.findMany({
    where: { establishmentId, channel: "ONLINE", active: true, variant: { active: true, product: { organizationId: establishment.organizationId, active: true } } },
    include: { variant: { include: { product: { include: { category: true } } } } },
    orderBy: [{ variant: { product: { category: { sortOrder: "asc" } } } }, { variant: { product: { name: "asc" } } }],
  });
  const highlightOffering = establishment.highlightProduct ? offerings.find(offering => offering.variant.product.id === establishment.highlightProduct!.id) : undefined;

  return Response.json({
    establishment: {
      name: establishment.name,
      logoUrl: establishment.logoUrl,
      bannerUrl: establishment.bannerUrl,
      highlightHeadline: establishment.highlightHeadline,
      highlightProduct: establishment.highlightProduct ? { id: establishment.highlightProduct.id, name: establishment.highlightProduct.name, price: Number(highlightOffering?.price ?? 0), imageUrl: establishment.highlightProduct.imageUrl } : null,
    },
    products: offerings.map(offering => ({
      id: offering.variant.product.id,
      name: offering.variant.product.name,
      category: offering.variant.product.category?.name ?? "Outros",
      description: offering.variant.product.description,
      price: Number(offering.price),
      imageUrl: offering.variant.product.imageUrl,
    })),
  });
}
