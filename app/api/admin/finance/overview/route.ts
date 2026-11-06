import { z } from "zod";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { financeOverview } from "@/lib/finance-data";

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const local = isLocalAuthEnabled();
  const session = local ? await getLocalSession() : await getCurrentSession();
  if (!session?.canViewFinanceCashflow) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const url = new URL(request.url);
  const parsed = z.object({ days: z.enum(["7", "15", "30", "60", "90"]), accountId: z.string().min(1).optional() }).safeParse({ days: url.searchParams.get("days") ?? "30", accountId: url.searchParams.get("accountId") ?? undefined });
  if (!parsed.success) return Response.json({ error: "Filtro inválido." }, { status: 400 });
  try {
    const data = await financeOverview(session.organization.id, session.establishment.id, Number(parsed.data.days), parsed.data.accountId, local);
    if (parsed.data.accountId && !data.accountBalances.length) return Response.json({ error: "Conta não encontrada." }, { status: 404 });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Não foi possível calcular o financeiro. Confira os lançamentos e tente novamente." }, { status: 500 }); }
}
