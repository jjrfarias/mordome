import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { assertTvSameOrigin, authenticateTvDisplayToken, tvDisplaySessionCookie, tvDisplayTokenHash, tvFailure, tvJson, TvError } from "@/lib/tv-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

export async function POST(request: Request) {
  try {
    assertTvSameOrigin(request);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(`tv-pair:${ip}`, 20, 600_000).allowed) throw new TvError("Aguarde alguns minutos para gerar outro código.", 429);
    const token = randomBytes(32).toString("base64url");
    const code = randomBytes(5).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 600_000);
    await db.tvPairing.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.tvPairing.create({ data: { codeHash: tvDisplayTokenHash(code), deviceHash: tvDisplayTokenHash(token), expiresAt } });
    const response = tvJson({ code, expiresAt: expiresAt.toISOString() }, 201);
    response.headers.append("Set-Cookie", `mordome_tv_pair=${token}; HttpOnly; SameSite=Strict; Path=/api/tv/pair; Max-Age=600${secure}`);
    response.headers.append("Set-Cookie", `mordome_tv_screen=; HttpOnly; SameSite=Strict; Path=/tv; Max-Age=0${secure}`);
    return response;
  } catch (error) { return tvFailure(error); }
}

export async function GET() {
  try {
    const token = (await cookies()).get("mordome_tv_pair")?.value ?? "";
    if (!/^[\w-]{43}$/.test(token)) throw new TvError("Gere um novo código nesta TV.", 401);
    const pairing = await db.tvPairing.findUnique({ where: { deviceHash: tvDisplayTokenHash(token) } });
    if (!pairing || pairing.expiresAt <= new Date()) throw new TvError("O código expirou. Gere outro para continuar.", 410);
    if (!pairing.displayId) return tvJson({ pending: true });
    await authenticateTvDisplayToken(pairing.displayId, token);
    const response = tvJson({ displayId: pairing.displayId });
    response.headers.append("Set-Cookie", tvDisplaySessionCookie(pairing.displayId, token));
    response.headers.append("Set-Cookie", `mordome_tv_screen=${pairing.displayId}; HttpOnly; SameSite=Strict; Path=/tv; Max-Age=31536000${secure}`);
    return response;
  } catch (error) { return tvFailure(error); }
}
