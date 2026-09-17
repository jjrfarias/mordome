import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { listLocalCatalog, updateLocalCatalogProductFiscalInfo } from "@/lib/local-catalog";

// Dados fiscais por produto (ADR 0049): NCM/CFOP/CST-CSOSN/origem/unidade, exigidos pela SEFAZ
// para emitir NFC-e — tela própria (não misturada no cadastro de preço/canal do Cardápio) porque é
// um dado que só o dono ou o contador preenche, uma vez, quase nunca muda depois.
const fieldSchema = z.string().trim().max(20).nullable().optional();
const patchSchema = z.object({ productId: z.string().min(1), ncm: fieldSchema, cfop: fieldSchema, icmsCst: fieldSchema, icmsOrigin: fieldSchema, unitOfMeasure: fieldSchema })
  .refine(value => Object.entries(value).some(([key, field]) => key !== "productId" && field !== undefined), { message: "Informe ao menos um campo para atualizar." });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageFiscal) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFiscal) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const products = listLocalCatalog(session.establishment.id).map(product => ({ id: product.id, name: product.name, category: product.category, ncm: product.ncm, cfop: product.cfop, icmsCst: product.icmsCst, icmsOrigin: product.icmsOrigin, unitOfMeasure: product.unitOfMeasure }));
    return Response.json({ products });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const products = await db.product.findMany({ where: { organizationId: actor.organization.id, active: true }, include: { category: { select: { name: true } } }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] });
  return Response.json({ products: products.map(product => ({ id: product.id, name: product.name, category: product.category?.name ?? "Sem categoria", ncm: product.ncm, cfop: product.cfop, icmsCst: product.icmsCst, icmsOrigin: product.icmsOrigin, unitOfMeasure: product.unitOfMeasure })) });
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const { productId, ...data } = parsed.data;
  // Campo em branco ("") limpa o dado; ausente mantém o que já estava.
  const normalized = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value]));

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFiscal) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = updateLocalCatalogProductFiscalInfo(productId, normalized);
    if (updated === "NOT_FOUND") return Response.json({ error: "Produto não encontrado." }, { status: 404 });
    return Response.json({ product: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const current = await db.product.findFirst({ where: { id: productId, organizationId: actor.organization.id } });
  if (!current) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  const product = await db.product.update({ where: { id: current.id }, data: normalized });
  return Response.json({ product: { id: product.id, ncm: product.ncm, cfop: product.cfop, icmsCst: product.icmsCst, icmsOrigin: product.icmsOrigin, unitOfMeasure: product.unitOfMeasure } });
}
