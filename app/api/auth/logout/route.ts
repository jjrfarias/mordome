import { destroySession, isSameOrigin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  await destroySession();
  return Response.json({ ok: true });
}
