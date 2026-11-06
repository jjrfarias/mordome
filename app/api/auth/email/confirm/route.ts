import { after } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { consumeAccountToken } from "@/lib/account-security-store";
import { INVALID_LINK, securityTokenSchema } from "@/lib/account-security-policy";
import { notifySecurityChange } from "@/lib/account-security-delivery";
import { securityFailure, securityRate, securityResponse, validSecurityOrigin } from "@/lib/account-security-http";

export async function POST(request: Request) {
  if (!validSecurityOrigin(request)) return securityResponse({ error: "Origem inválida." }, 403);
  const parsed = z.object({ token: securityTokenSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return securityResponse({ error: INVALID_LINK }, 400);
  try {
    if (!await securityRate(request, "email-confirm")) return securityResponse({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
    const result = await consumeAccountToken(db, parsed.data.token, "VERIFY_EMAIL");
    if (!result) return securityResponse({ error: INVALID_LINK }, 400);
    if (result.previousEmail && result.previousEmail !== result.email) {
      after(() => notifySecurityChange(result.previousEmail!, "O e-mail de recuperação da sua conta Mordomê foi alterado. Se não foi você, procure imediatamente o responsável pelo sistema."));
    }
    return securityResponse({ message: "E-mail confirmado. Entre novamente para continuar. A recuperação de senha já está disponível para sua conta." });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return securityResponse({ error: "Não foi possível confirmar este endereço. Entre na sua conta e solicite um link para outro e-mail." }, 400);
    return securityFailure();
  }
}
