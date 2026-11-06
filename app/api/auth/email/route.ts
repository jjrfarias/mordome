import { after } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { emailSchema } from "@/lib/account-security-policy";
import { securityMailConfig } from "@/lib/security-mail";
import { deliverAccountToken } from "@/lib/account-security-delivery";
import { securityFailure, securityRate, securityResponse, validSecurityOrigin } from "@/lib/account-security-http";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return securityResponse({ error: "Entre na sua conta para cadastrar ou alterar seu e-mail." }, 401);
    const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { email: true, emailVerifiedAt: true, pendingEmail: true } });
    return securityResponse(user);
  } catch { return securityFailure(); }
}

export async function POST(request: Request) {
  if (!validSecurityOrigin(request)) return securityResponse({ error: "Origem inválida." }, 403);
  const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return securityResponse({ error: "Informe um e-mail válido e sua senha atual." }, 400);
  try {
    const session = await getCurrentSession();
    if (!session) return securityResponse({ error: "Entre novamente para continuar." }, 401);
    securityMailConfig();
    if (!await securityRate(request, "email-request", session.user.id)) return securityResponse({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
    const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
    if (!await verifyPassword(parsed.data.password, user.passwordHash)) return securityResponse({ error: "Senha atual incorreta." }, 400);
    if (user.email === parsed.data.email && user.emailVerifiedAt) return securityResponse({ message: "Este e-mail já está confirmado." });
    if (!await securityRate(request, "email-destination", parsed.data.email, 3)) return securityResponse({ error: "Aguarde 15 minutos antes de solicitar outro envio." }, 429);
    after(() => deliverAccountToken(user.id, "VERIFY_EMAIL", parsed.data.email, user.passwordHash));
    return securityResponse({ message: "Solicitação recebida. Confira o e-mail e a caixa de spam. O link vale por 24 horas. Para reenviar, aguarde alguns minutos e solicite novamente." }, 202);
  } catch { return securityFailure(); }
}
