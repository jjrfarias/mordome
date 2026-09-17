import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { createLocalEstablishment, getLocalSession, isLocalAuthEnabled, listLocalEstablishments, updateLocalEstablishment } from "@/lib/local-auth";
import { slugify } from "@/lib/auth-validation";
import { canDeactivateEstablishment } from "@/lib/permissions";
import { requestAuditMetadata } from "@/lib/audit";
import { recordLocalAudit } from "@/lib/local-audit";
import { PRODUCT_IMAGE_URL_MAX_LENGTH } from "@/lib/catalog-validation";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

const addressSchema = z.object({
  postalCode: z.string().trim().max(9).optional(),
  street: z.string().trim().max(200).optional(),
  number: z.string().trim().max(20).optional(),
  complement: z.string().trim().max(100).optional(),
  neighborhood: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(2).optional(),
});

// Vitrine do delivery (ADR 0053): logoUrl/bannerUrl aceitam string vazia para "remover a imagem" —
// mesmo critério do endereço (campo vazio = limpa o valor), diferente de "campo não enviado" (não
// mexe no que já existe). Reaproveita o limite de tamanho de PRODUCT_IMAGE_URL_MAX_LENGTH (ADR 0032).
const imageOrEmpty = z.string().max(PRODUCT_IMAGE_URL_MAX_LENGTH).refine(value => value === "" || value.startsWith("data:image/"), { message: "Formato de imagem inválido." });
const storefrontSchema = z.object({
  logoUrl: imageOrEmpty.optional(),
  bannerUrl: imageOrEmpty.optional(),
  highlightProductId: z.string().trim().max(100).optional(),
  highlightHeadline: z.string().trim().max(120).optional(),
});

const patchSchema = z.object({
  establishmentId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(100).optional(),
  active: z.boolean().optional(),
}).merge(addressSchema).merge(storefrontSchema).refine(value => value.name !== undefined || value.active !== undefined || [...Object.keys(addressSchema.shape), ...Object.keys(storefrontSchema.shape)].some(key => value[key as keyof typeof value] !== undefined), {
  message: "Informe um nome, um novo status, um endereço ou dados da vitrine.",
});

const addressKeys = ["postalCode", "street", "number", "complement", "neighborhood", "city", "state"] as const;
function addressPatch(data: z.infer<typeof patchSchema>) {
  const patch: Partial<Record<(typeof addressKeys)[number], string | null>> = {};
  for (const key of addressKeys) {
    const value = data[key];
    if (value === undefined) continue;
    patch[key] = key === "postalCode" ? value.replace(/\D/g, "") || null : value || null;
  }
  return patch;
}

const storefrontKeys = ["logoUrl", "bannerUrl", "highlightProductId", "highlightHeadline"] as const;
function storefrontPatch(data: z.infer<typeof patchSchema>) {
  const patch: Partial<Record<(typeof storefrontKeys)[number], string | null>> = {};
  for (const key of storefrontKeys) {
    const value = data[key];
    if (value === undefined) continue;
    patch[key] = value || null;
  }
  return patch;
}

type EstablishmentPayload = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  highlightProductId: string | null;
  highlightHeadline: string | null;
};

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;

  const organizationId = session.organization.id;
  const membership = await db.organizationMembership.findFirst({
    where: { userId: session.user.id, organizationId, status: MembershipStatus.ACTIVE },
    include: { accesses: { select: { establishmentId: true } } },
  });
  if (!membership) return null;

  return { session, organizationId, membership };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    if (!await getLocalSession()) return Response.json({ error: "Não autenticado." }, { status: 401 });
    return Response.json({ establishments: listLocalEstablishments() });
  }
  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageEstablishments) return Response.json({ error: "Apenas o proprietário pode gerenciar estabelecimentos." }, { status: 403 });

  const accessible = actor.membership.accesses.map((item) => item.establishmentId);
  if (accessible.length === 0) return Response.json({ establishments: [] });

  const establishments = await db.establishment.findMany({
    where: { organizationId: actor.organizationId, id: { in: accessible } },
    orderBy: { name: "asc" },
  });

  return Response.json({
    establishments: establishments.map((establishment) => ({
      id: establishment.id,
      name: establishment.name,
      slug: establishment.slug,
      active: establishment.active,
      postalCode: establishment.postalCode,
      street: establishment.street,
      number: establishment.number,
      complement: establishment.complement,
      neighborhood: establishment.neighborhood,
      city: establishment.city,
      state: establishment.state,
      logoUrl: establishment.logoUrl,
      bannerUrl: establishment.bannerUrl,
      highlightProductId: establishment.highlightProductId,
      highlightHeadline: establishment.highlightHeadline,
    })),
  } satisfies { establishments: EstablishmentPayload[] });
};

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const created = createLocalEstablishment(parsed.data.name, slugify(parsed.data.name));
    if (!created) return Response.json({ error: "Já existe um estabelecimento com esse nome." }, { status: 409 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: created.id, establishmentName: created.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "CREATE", entityType: "Establishment", entityId: created.id, reason: "Criação de estabelecimento", after: created, ...requestAuditMetadata(request) });
    return Response.json({ establishment: created }, { status: 201 });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageEstablishments) return Response.json({ error: "Apenas o proprietário pode gerenciar estabelecimentos." }, { status: 403 });

  try {
    const created = await db.$transaction(async (tx) => {
      const establishment = await tx.establishment.create({
        data: { organizationId: actor.organizationId, name: parsed.data.name, slug: slugify(parsed.data.name), diningTables: { create: Array.from({ length: 12 }, (_, index) => ({ number: index + 1, seats: 4 })) } },
      });
      await tx.establishmentAccess.create({ data: { membershipId: actor.membership.id, establishmentId: establishment.id } });
      await tx.auditEvent.create({
        data: {
          organizationId: actor.organizationId,
          establishmentId: establishment.id,
          actorId: actor.session.user.id,
          action: "CREATE",
          entityType: "Establishment",
          entityId: establishment.id,
          reason: "Criação de estabelecimento",
          after: { id: establishment.id, name: establishment.name, slug: establishment.slug, active: establishment.active },
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        },
      });
      return establishment;
    });
    return Response.json({ establishment: { id: created.id, name: created.name, slug: created.slug, active: created.active } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "Já existe um estabelecimento com esse nome." }, { status: 409 });
    }
    return Response.json({ error: "Não foi possível cadastrar o estabelecimento." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    const data = parsed.data;
    const current = listLocalEstablishments().find(item => item.id === data.establishmentId);
    if (!current) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    if (data.active === false) {
      const decision = canDeactivateEstablishment({ establishmentId: current.id, activeEstablishmentId: session.establishment.id, activeEstablishmentCount: listLocalEstablishments().filter(item => item.active).length });
      if (!decision.allowed) return Response.json({ error: decision.reason }, { status: 403 });
    }
    const updated = updateLocalEstablishment(current.id, {
      ...(data.name === undefined ? {} : { name: data.name, slug: slugify(data.name) }),
      ...(data.active === undefined ? {} : { active: data.active }),
      ...addressPatch(data),
      ...storefrontPatch(data),
    });
    if (updated === "DUPLICATE") return Response.json({ error: "Já existe um estabelecimento com esse nome." }, { status: 409 });
    if (!updated) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    recordLocalAudit({ organizationId: session.organization.id, establishmentId: updated.id, establishmentName: updated.name, actorId: session.user.id, actorName: session.user.name, actorUsername: session.user.username, action: "UPDATE", entityType: "Establishment", entityId: updated.id, reason: data.active === false ? "Desativação de estabelecimento" : data.active === true ? "Ativação de estabelecimento" : "Atualização de estabelecimento", before: current, after: updated, ...requestAuditMetadata(request) });
    return Response.json({ establishment: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (!actor.session.canManageEstablishments) return Response.json({ error: "Apenas o proprietário pode gerenciar estabelecimentos." }, { status: 403 });

  const data = parsed.data;
  const accessAllowed = await db.establishmentAccess.findFirst({
    where: { membershipId: actor.membership.id, establishmentId: data.establishmentId },
  });
  if (!accessAllowed) return Response.json({ error: "Acesso negado a este estabelecimento." }, { status: 403 });

  const current = await db.establishment.findUnique({
    where: { id: data.establishmentId, organizationId: actor.organizationId },
  });
  if (!current) return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });

  if (data.highlightProductId) {
    const product = await db.product.findFirst({ where: { id: data.highlightProductId, organizationId: actor.organizationId } });
    if (!product) return Response.json({ error: "Produto em destaque não encontrado." }, { status: 400 });
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      const fresh = await tx.establishment.findUnique({
        where: { id: current.id, organizationId: actor.organizationId },
      });
      if (!fresh) throw new Error("ESTABLISHMENT_NOT_FOUND");

      if (data.active === false) {
        const activeCount = await tx.establishment.count({ where: { organizationId: actor.organizationId, active: true } });
        const decision = canDeactivateEstablishment({ establishmentId: fresh.id, activeEstablishmentId: actor.session.establishment.id, activeEstablishmentCount: activeCount });
        if (!decision.allowed) throw new Error(decision.reason);
      }

      const payload: Record<string, unknown> = {};
      const after: Record<string, unknown> = { ...fresh };
      if (data.name !== undefined) {
        payload.name = data.name;
        payload.slug = slugify(data.name);
        after.name = data.name;
        after.slug = slugify(data.name);
      }
      if (data.active !== undefined) {
        payload.active = data.active;
        after.active = data.active;
      }
      const addressChanges = addressPatch(data);
      if (Object.keys(addressChanges).length > 0) {
        Object.assign(payload, addressChanges);
        Object.assign(after, addressChanges);
      }
      const storefrontChanges = storefrontPatch(data);
      if (Object.keys(storefrontChanges).length > 0) {
        Object.assign(payload, storefrontChanges);
        Object.assign(after, { ...storefrontChanges, logoUrl: storefrontChanges.logoUrl ? "(imagem atualizada)" : storefrontChanges.logoUrl, bannerUrl: storefrontChanges.bannerUrl ? "(imagem atualizada)" : storefrontChanges.bannerUrl });
      }

      const changed = await tx.establishment.update({ where: { id: fresh.id }, data: payload });
      await tx.auditEvent.create({
        data: {
          organizationId: actor.organizationId,
          establishmentId: changed.id,
          actorId: actor.session.user.id,
          action: "UPDATE",
          entityType: "Establishment",
          entityId: changed.id,
          reason: data.name && data.active === undefined
            ? "Atualização de nome de estabelecimento"
            : data.active === false
              ? "Desativação de estabelecimento"
              : data.active === true
                ? "Ativação de estabelecimento"
                : Object.keys(addressChanges).length > 0
                  ? "Atualização de endereço do estabelecimento"
                  : "Atualização de estabelecimento",
          before: { id: fresh.id, name: fresh.name, slug: fresh.slug, active: fresh.active, postalCode: fresh.postalCode, street: fresh.street, number: fresh.number, complement: fresh.complement, neighborhood: fresh.neighborhood, city: fresh.city, state: fresh.state } as Prisma.JsonObject,
          after: after as Prisma.JsonObject,
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        },
      });
      return changed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json({ establishment: { id: updated.id, name: updated.name, slug: updated.slug, active: updated.active, postalCode: updated.postalCode, street: updated.street, number: updated.number, complement: updated.complement, neighborhood: updated.neighborhood, city: updated.city, state: updated.state, logoUrl: updated.logoUrl, bannerUrl: updated.bannerUrl, highlightProductId: updated.highlightProductId, highlightHeadline: updated.highlightHeadline } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "Já existe um estabelecimento com esse nome." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return Response.json({ error: "A unidade foi alterada ao mesmo tempo por outra pessoa. Tente novamente." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ESTABLISHMENT_NOT_FOUND") {
      return Response.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    }
    if (error instanceof Error && (error.message === "Troque a unidade ativa antes de desativá-la." || error.message === "É necessário manter pelo menos uma unidade ativa.")) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json({ error: "Não foi possível atualizar o estabelecimento." }, { status: 500 });
  }
}
