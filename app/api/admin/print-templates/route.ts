import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { DEFAULT_PRINT_TEMPLATE, getLocalPrintTemplate, upsertLocalPrintTemplate } from "@/lib/local-print-templates";

const updateSchema = z.object({
  headerText: z.string().trim().max(200).nullable().optional(),
  footerText: z.string().trim().max(200).nullable().optional(),
  showDocument: z.boolean(),
  paperWidth: z.union([z.literal(58), z.literal(80)]),
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session || !session.canManageIntegrations) return null;
  return session;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
    return Response.json({ template: getLocalPrintTemplate(session.establishment.id), establishmentDocument: null });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const [record, establishment] = await Promise.all([
    db.printTemplate.findUnique({ where: { establishmentId: actor.establishment.id } }),
    db.establishment.findUnique({ where: { id: actor.establishment.id }, select: { document: true } }),
  ]);
  const template = record
    ? { headerText: record.headerText, footerText: record.footerText, showDocument: record.showDocument, paperWidth: record.paperWidth }
    : DEFAULT_PRINT_TEMPLATE;
  return Response.json({ template, establishmentDocument: establishment?.document ?? null });
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageIntegrations) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const updated = upsertLocalPrintTemplate(session.establishment.id, { headerText: data.headerText, footerText: data.footerText, showDocument: data.showDocument, paperWidth: data.paperWidth });
    return Response.json({ template: updated });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const updated = await db.printTemplate.upsert({
    where: { establishmentId: actor.establishment.id },
    create: { establishmentId: actor.establishment.id, headerText: data.headerText ?? null, footerText: data.footerText ?? null, showDocument: data.showDocument, paperWidth: data.paperWidth },
    update: { headerText: data.headerText ?? null, footerText: data.footerText ?? null, showDocument: data.showDocument, paperWidth: data.paperWidth },
  });
  return Response.json({ template: { headerText: updated.headerText, footerText: updated.footerText, showDocument: updated.showDocument, paperWidth: updated.paperWidth } });
}
