import { getCurrentSession, isSameOrigin, selectEstablishment } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled, selectLocalEstablishment } from "@/lib/local-auth";
import { z } from "zod";

const inputSchema = z.object({ establishmentId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unidade inválida." }, { status: 400 });

  if (isLocalAuthEnabled()) {
    if (!await selectLocalEstablishment(parsed.data.establishmentId)) return Response.json({ error: "Acesso negado a esta unidade." }, { status: 403 });
    return Response.json({ session: await getLocalSession() });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const allowed = session.establishments.map(establishment => establishment.id);
  if (!await selectEstablishment(session.sessionId, parsed.data.establishmentId, allowed)) return Response.json({ error: "Acesso negado a esta unidade." }, { status: 403 });
  return Response.json({ session: await getCurrentSession() });
}
