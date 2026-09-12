import { getCurrentSession } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";

export async function GET() {
  const session = isLocalAuthEnabled() ? await getLocalSession() : await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  return Response.json({ session });
}
