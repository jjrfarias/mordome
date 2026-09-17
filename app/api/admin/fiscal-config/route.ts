import { FiscalEnvironment, FiscalTaxRegime, MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { getLocalFiscalConfig, updateLocalFiscalConfig } from "@/lib/local-fiscal";

const patchSchema = z.object({
  active: z.boolean().optional(),
  providerApiToken: z.union([z.string().trim().max(200), z.literal("")]).nullable().optional(),
  environment: z.enum(FiscalEnvironment).optional(),
  stateRegistration: z.union([z.string().trim().max(30), z.literal("")]).nullable().optional(),
  taxRegime: z.enum(FiscalTaxRegime).nullable().optional(),
}).refine(value => Object.values(value).some(field => field !== undefined), { message: "Informe ao menos um campo para atualizar." });

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageFiscal) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

// Configuração fiscal por estabelecimento (ADR 0049): o token do provedor NUNCA é devolvido de
// volta ao navegador na leitura (só um indicador "configurado: sim/não") — mesmo padrão de
// qualquer segredo já usado no sistema (senha, nunca reexibida).
function serialize(config: { active: boolean; environment: string; stateRegistration: string | null; taxRegime: string | null; providerApiToken: string | null }) {
  return { active: config.active, environment: config.environment, stateRegistration: config.stateRegistration, taxRegime: config.taxRegime, hasProviderApiToken: Boolean(config.providerApiToken) };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFiscal) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({ config: serialize(getLocalFiscalConfig(session.establishment.id)) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const config = await db.fiscalConfig.findUnique({ where: { establishmentId: actor.establishment.id } });
  return Response.json({ config: serialize(config ?? { active: false, environment: "HOMOLOGACAO", stateRegistration: null, taxRegime: null, providerApiToken: null }) });
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;
  const providerApiToken = data.providerApiToken === "" ? null : data.providerApiToken;
  const stateRegistration = data.stateRegistration === "" ? null : data.stateRegistration;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageFiscal) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = updateLocalFiscalConfig(session.establishment.id, { active: data.active, providerApiToken, environment: data.environment, stateRegistration, taxRegime: data.taxRegime });
    return Response.json({ config: serialize(updated) });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const config = await db.fiscalConfig.upsert({
    where: { establishmentId: actor.establishment.id },
    update: { active: data.active, providerApiToken, environment: data.environment, stateRegistration, taxRegime: data.taxRegime },
    create: { establishmentId: actor.establishment.id, active: data.active ?? false, providerApiToken, environment: data.environment ?? "HOMOLOGACAO", stateRegistration, taxRegime: data.taxRegime },
  });
  await db.auditEvent.create({ data: { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, action: "UPDATE", entityType: "FiscalConfig", entityId: config.id, reason: "Configuração fiscal atualizada", after: { active: config.active, environment: config.environment } } });
  return Response.json({ config: serialize(config) });
}
