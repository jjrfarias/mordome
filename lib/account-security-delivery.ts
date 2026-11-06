import { db } from "@/lib/db";
import { issueAccountToken } from "@/lib/account-security-store";
import { securityLink, type SecurityPurpose } from "@/lib/account-security-policy";
import { securityMailConfig, sendSecurityMail } from "@/lib/security-mail";

export async function deliverAccountToken(userId: string, purpose: SecurityPurpose, email: string, expectedPasswordHash?: string) {
  let issued: Awaited<ReturnType<typeof issueAccountToken>> = null;
  try {
    const { origin } = securityMailConfig();
    issued = await issueAccountToken(db, userId, purpose, email, expectedPasswordHash);
    if (!issued) return;
    const reset = purpose === "RESET_PASSWORD";
    if (purpose === "ACCEPT_INVITE") {
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
      await sendSecurityMail(email, "Você foi convidado para o Mordomê", `Você recebeu um convite para acessar o Mordomê.

Seu usuário: ${user.username}

Abra o link para confirmar seu e-mail e criar sua própria senha:
${securityLink(origin, purpose, issued.token)}

O link é de uso único e expira em 24 horas. Se expirou, peça ao administrador para reenviar o convite. Se não reconhece este convite, ignore a mensagem.`);
      return;
    }
    await sendSecurityMail(email, reset ? "Redefina sua senha — Mordomê" : "Confirme seu e-mail — Mordomê",
      `${reset ? "Recebemos uma solicitação de recuperação de senha." : "Confirme este endereço para proteger sua conta e recuperar sua senha."}\n\n${securityLink(origin, purpose, issued.token)}\n\nO link pode ser usado uma única vez e expira em ${reset ? "30 minutos" : "24 horas"}.\nSe você não solicitou esta ação, ignore esta mensagem. Não compartilhe este link.`);
  } catch {
    if (issued) await db.accountSecurityToken.updateMany({ where: { id: issued.id, consumedAt: null }, data: { consumedAt: new Date() } }).catch(() => {});
    console.error(JSON.stringify({ event: "account_security_email_failed", purpose }));
  }
}

export async function deliverResetForEmail(email: string) {
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (user?.active && user.emailVerifiedAt) await deliverAccountToken(user.id, "RESET_PASSWORD", email);
  } catch { console.error(JSON.stringify({ event: "account_security_email_failed", purpose: "RESET_PASSWORD" })); }
}

export async function notifySecurityChange(email: string, text: string) {
  try { await sendSecurityMail(email, "Alteração de segurança — Mordomê", text); }
  catch { console.error(JSON.stringify({ event: "account_security_notice_failed" })); }
}
