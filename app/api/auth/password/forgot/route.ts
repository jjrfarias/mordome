import { after } from "next/server";
import { z } from "zod";
import { emailSchema, RESET_MESSAGE } from "@/lib/account-security-policy";
import { securityMailConfig } from "@/lib/security-mail";
import { deliverResetForEmail } from "@/lib/account-security-delivery";
import { securityFailure, securityRate, securityResponse, validSecurityOrigin } from "@/lib/account-security-http";

export async function POST(request: Request) {
  if (!validSecurityOrigin(request)) return securityResponse({ error: "Origem inválida." }, 403);
  const parsed = z.object({ email: emailSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return securityResponse({ error: "Informe um e-mail válido." }, 400);
  try {
    securityMailConfig();
    const allowed = await securityRate(request, "password-forgot", parsed.data.email, 3);
    // Same response for absent, disabled, unverified and rate-limited identities.
    if (allowed) after(() => deliverResetForEmail(parsed.data.email));
    return securityResponse({ message: RESET_MESSAGE }, 202);
  } catch { return securityFailure(); }
}
