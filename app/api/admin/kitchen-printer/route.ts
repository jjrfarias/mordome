import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { isLocalAuthEnabled } from "@/lib/local-auth";
import { printTokenHash } from "@/lib/kitchen-print";
import { z } from "zod";

export const runtime = "nodejs";

async function actor(request: Request) {
  if (!isSameOrigin(request) || isLocalAuthEnabled()) return null;
  const session = await getCurrentSession();
  return session?.canManageIntegrations ? session : null;
}

export async function GET(request: Request) {
  const session = await actor(request);
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const agent = await db.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true }, select: { id: true, name: true, activatedAt: true, lastSeenAt: true, receiptsActivatedAt: true } });
  return Response.json({ agent }, { headers: { "Cache-Control": "no-store" } });
}

const receiptSetting = z.object({ automaticReceipts: z.boolean() });

export async function PUT(request: Request) {
  const session = await actor(request);
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = receiptSetting.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Configuração inválida." }, { status: 400 });
  const agent = await db.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true } });
  if (!agent) return Response.json({ error: "Instale a impressora automática primeiro." }, { status: 404 });
  if (Boolean(agent.receiptsActivatedAt) === parsed.data.automaticReceipts) return Response.json({ automaticReceipts: parsed.data.automaticReceipts });
  await db.$transaction([
    db.kitchenPrintAgent.update({ where: { id: agent.id }, data: { receiptsActivatedAt: parsed.data.automaticReceipts ? new Date() : null } }),
    db.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "UPDATE", entityType: "KitchenPrintAgent", entityId: agent.id, reason: parsed.data.automaticReceipts ? "Comprovantes automáticos ativados" : "Comprovantes automáticos desativados" } }),
  ]);
  return Response.json({ automaticReceipts: parsed.data.automaticReceipts });
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

// Reconnect the same physical printer without replacing its job history. A new
// credential invalidates the old PC immediately; pending jobs stay queued.
export async function PATCH(request: Request) {
  const session = await actor(request);
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const token = randomBytes(32).toString("hex");
  const agent = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Establishment" WHERE "id" = ${session.establishment.id} FOR UPDATE`;
    const current = await tx.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true } });
    if (!current) return null;
    await tx.kitchenPrintAgent.update({ where: { id: current.id }, data: { tokenHash: printTokenHash(token), lastSeenAt: null } });
    await tx.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "UPDATE", entityType: "KitchenPrintAgent", entityId: current.id, reason: "Credencial da impressora renovada pelo painel" } });
    return current;
  });
  if (!agent) return Response.json({ error: "Nenhuma impressora ativa." }, { status: 404 });
  return Response.json({ token, url: new URL(request.url).origin, agentId: agent.id }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const session = await actor(request);
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const agent = await db.kitchenPrintAgent.findFirst({ where: { establishmentId: session.establishment.id, active: true } });
  if (!agent) return Response.json({ error: "Nenhuma impressora ativa." }, { status: 404 });
  await db.$transaction([db.kitchenPrintAgent.update({ where: { id: agent.id }, data: { active: false } }), db.auditEvent.create({ data: { organizationId: session.organization.id, establishmentId: session.establishment.id, actorId: session.user.id, action: "UPDATE", entityType: "KitchenPrintAgent", entityId: agent.id, reason: "Agente de impressão desativado pelo painel" } })]);
  return Response.json({ ok: true });
}
