import { isSameOrigin, getCurrentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestAuditMetadata } from "@/lib/audit";
import { tenantBrandingSchema } from "@/lib/branding-validation";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });
  return Response.json({ branding: session.organization.branding });
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const session = await getCurrentSession();
  if (!session?.canManageEstablishments) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = tenantBrandingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const before = session.organization.branding;
  const updated = await db.organization.update({ where: { id: session.organization.id }, data: { brandLogoUrl: parsed.data.logoUrl || null, brandPrimary: parsed.data.primary.toLowerCase(), brandAccent: parsed.data.accent.toLowerCase() } });
  await db.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "UPDATE", entityType: "OrganizationBranding", entityId: session.organization.id, reason: "Identidade visual da organização atualizada", before: { primary: before.primary, accent: before.accent, hasLogo: Boolean(before.logoUrl) }, after: { primary: updated.brandPrimary, accent: updated.brandAccent, hasLogo: Boolean(updated.brandLogoUrl) }, ...requestAuditMetadata(request) } });
  return Response.json({ branding: { logoUrl: updated.brandLogoUrl, primary: updated.brandPrimary, accent: updated.brandAccent } });
}
