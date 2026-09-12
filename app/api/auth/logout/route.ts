import { destroySession, isSameOrigin } from "@/lib/auth";
import { destroyLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) { await destroyLocalSession(); return Response.json({ ok: true }); }
  await destroySession();
  return Response.json({ ok: true });
}
