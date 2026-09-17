import { MembershipStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { getLocalStockPositionHistory } from "@/lib/local-inventory";
import { defaultMonthRange } from "@/lib/cashflow";

const querySchema = z.object({
  establishmentItemId: z.string().min(1),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canManageStock) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

function resolveRange(from?: string, to?: string) {
  if (!from || !to) {
    const { from: defaultFrom, to: defaultTo } = defaultMonthRange();
    return { fromDate: defaultFrom, toDate: defaultTo };
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setUTCHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    establishmentItemId: url.searchParams.get("establishmentItemId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) return Response.json({ error: "Parâmetros inválidos." }, { status: 400 });
  const { fromDate, toDate } = resolveRange(parsed.data.from, parsed.data.to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return Response.json({ error: "Período inválido." }, { status: 400 });
  }

  if (isLocalAuthEnabled()) {
    const session = await getLocalSession();
    if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!session.canManageStock) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });
    const result = getLocalStockPositionHistory(session.establishment.id, parsed.data.establishmentItemId, fromDate, toDate);
    if (!result) return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });
    return Response.json({ ...result, from: fromDate.toISOString(), to: toDate.toISOString() });
  }

  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado ao estoque." }, { status: 403 });

  const establishmentItem = await db.establishmentInventoryItem.findFirst({
    where: { id: parsed.data.establishmentItemId, establishmentId: actor.establishment.id, inventoryItem: { organizationId: actor.organization.id } },
  });
  if (!establishmentItem) return Response.json({ error: "Item de estoque não encontrado." }, { status: 404 });

  const [openingMovements, periodMovements] = await Promise.all([
    db.stockMovement.findMany({ where: { establishmentItemId: establishmentItem.id, createdAt: { lt: fromDate } }, select: { quantity: true } }),
    db.stockMovement.findMany({ where: { establishmentItemId: establishmentItem.id, createdAt: { gte: fromDate, lte: toDate } }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, quantity: true, reason: true, sourceType: true, createdAt: true } }),
  ]);

  const openingBalance = openingMovements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
  let running = openingBalance;
  const rows = periodMovements.map(movement => {
    running += Number(movement.quantity);
    return { id: movement.id, type: movement.type, quantity: Number(movement.quantity), reason: movement.reason, sourceType: movement.sourceType, createdAt: movement.createdAt.toISOString(), runningBalance: running };
  });
  const totalIn = periodMovements.filter(movement => Number(movement.quantity) > 0).reduce((sum, movement) => sum + Number(movement.quantity), 0);
  const totalOut = periodMovements.filter(movement => Number(movement.quantity) < 0).reduce((sum, movement) => sum + Number(movement.quantity), 0);

  return Response.json({ openingBalance, closingBalance: running, totalIn, totalOut, movements: rows, from: fromDate.toISOString(), to: toDate.toISOString() });
}
