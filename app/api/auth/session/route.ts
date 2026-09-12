import { getCurrentSession } from "@/lib/auth";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  return Response.json({ session });
}
