import { after } from "next/server";
import { z } from "zod";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { deliverAccountToken } from "@/lib/account-security-delivery";
import { securityMailConfig } from "@/lib/security-mail";
import { securityFailure, securityRate, securityResponse } from "@/lib/account-security-http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return securityResponse({ error: "Origem inválida." }, 403);
  const session = await getCurrentSession();
  if (!session?.canCreateUsers) return securityResponse({ error: "Acesso negado." }, 403);
  const parsed = z.object({ membershipId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return securityResponse({ error: "Convite inválido." }, 400);
  try {
    const membership = await db.organizationMembership.findFirst({ where: { id: parsed.data.membershipId, organizationId: session.organization.id, status: "INVITED" }, include: { user: true } });
    if (!membership?.user.active || membership.user.emailVerifiedAt || !membership.user.pendingEmail) return securityResponse({ error: "Convite pendente não encontrado." }, 404);
    securityMailConfig();
    if (!await securityRate(request, "user-create-email", membership.user.pendingEmail, 3)) return securityResponse({ error: "Muitas solicitações. Aguarde antes de reenviar." }, 429);
    after(() => deliverAccountToken(membership.userId, "ACCEPT_INVITE", membership.user.pendingEmail!, membership.user.passwordHash));
    return securityResponse({ message: "Reenvio solicitado. O novo link substitui o convite anterior e permite criar a primeira senha." }, 202);
  } catch { return securityFailure(); }
}
