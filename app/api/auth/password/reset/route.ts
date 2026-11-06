import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { passwordSchema } from "@/lib/auth-validation";
import { hashPassword } from "@/lib/password";
import { INVALID_LINK, securityTokenSchema } from "@/lib/account-security-policy";
import { consumeAccountToken } from "@/lib/account-security-store";
import { notifySecurityChange } from "@/lib/account-security-delivery";
import { securityFailure, securityRate, securityResponse, validSecurityOrigin } from "@/lib/account-security-http";

export async function POST(request: Request) {
  if (!validSecurityOrigin(request)) return securityResponse({ error: "Origem inválida." }, 403);
  const parsed = z.object({ token: securityTokenSchema, password: passwordSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return securityResponse({ error: "Confira o link e use uma senha de 8 a 128 caracteres, com letra e número." }, 400);
  try {
    if (!await securityRate(request, "password-reset")) return securityResponse({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
    const result = await consumeAccountToken(db, parsed.data.token, "RESET_PASSWORD", await hashPassword(parsed.data.password));
    if (!result) return securityResponse({ error: INVALID_LINK }, 400);
    after(() => notifySecurityChange(result.email, "Sua senha do Mordomê foi alterada e todas as sessões foram encerradas. Se não foi você, recupere sua senha e procure o responsável pelo sistema."));
    return securityResponse({ message: "Senha alterada. Entre novamente com a nova senha. Todos os acessos anteriores foram encerrados." });
  } catch { return securityFailure(); }
}
