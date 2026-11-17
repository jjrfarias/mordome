import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { isLocalAuthEnabled } from "@/lib/local-auth";
import { printTokenHash } from "@/lib/kitchen-print";

export const runtime = "nodejs";

async function actor(request: Request) {
  if (!isSameOrigin(request) || isLocalAuthEnabled()) return null;
  const session = await getCurrentSession();
  return session?.canManageIntegrations ? session : null;
}

export async function GET(request: Request) {
  const session = await actor(request);
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const agent = await db.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true }, select: { id: true, name: true, activatedAt: true, lastSeenAt: true } });
  return Response.json({ agent }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await actor(request);
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const token = randomBytes(32).toString("hex");
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Establishment" WHERE "id" = ${session.establishment.id} FOR UPDATE`;
    if (await tx.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true }, select: { id: true } })) return null;
    const agent = await tx.kitchenPrintAgent.create({ data: { establishmentId: session.establishment.id, name: "Impressora da cozinha", tokenHash: printTokenHash(token) } });
    await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "CREATE", entityType: "KitchenPrintAgent", entityId: agent.id, reason: "Agente de impressão criado pelo painel" } });
    return agent;
  });
  if (!result) return Response.json({ error: "Já existe uma impressora ativa nesta unidade." }, { status: 409 });
  return Response.json({ token, url: new URL(request.url).origin, agentId: result.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const session = await actor(request);
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const agent = await db.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true } });
  if (!agent) return Response.json({ error: "Nenhuma impressora ativa." }, { status: 404 });
  await db.$transaction([db.kitchenPrintAgent.update({ where: { id: agent.id }, data: { active: false } }), db.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "UPDATE", entityType: "KitchenPrintAgent", entityId: agent.id, reason: "Agente de impressão desativado pelo painel" } })]);
  return Response.json({ ok: true });
}
