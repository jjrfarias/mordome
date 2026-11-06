import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { passwordSchema } from "@/lib/auth-validation";
import { hashPassword } from "@/lib/password";
import { INVALID_LINK, securityTokenSchema } from "@/lib/account-security-policy";
import { consumeAccountToken } from "@/lib/account-security-store";
import { securityFailure, securityRate, securityResponse, validSecurityOrigin } from "@/lib/account-security-http";

export async function POST(request: Request) {
  if (!validSecurityOrigin(request)) return securityResponse({ error: "Origem inválida." }, 403);
  const parsed = z.object({ token: securityTokenSchema, password: passwordSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return securityResponse({ error: "Confira o link e use uma senha de 8 a 128 caracteres, com letra e número." }, 400);
  try {
    if (!await securityRate(request, "invite-accept")) return securityResponse({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
    const result = await consumeAccountToken(db, parsed.data.token, "ACCEPT_INVITE", await hashPassword(parsed.data.password));
    if (!result) return securityResponse({ error: INVALID_LINK }, 400);
    return securityResponse({ message: "Convite aceito! E-mail confirmado e senha criada. Entre com o usuário informado no convite e sua nova senha." });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return securityResponse({ error: "Não foi possível confirmar este endereço. Procure o administrador da sua empresa." }, 400);
    return securityFailure();
  }
}
