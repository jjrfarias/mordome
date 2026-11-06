import nodemailer from "nodemailer";
import { emailSchema, securityOrigin } from "./account-security-policy.ts";

export function securityMailConfig() {
  const origin = securityOrigin(process.env.AUTH_PUBLIC_URL);
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = emailSchema.safeParse(process.env.SMTP_FROM);
  if (!host || !user || !pass || !from.success || ![465, 587].includes(port)) throw new Error("SECURITY_EMAIL_CONFIGURATION");
  return { origin, from: from.data, host, port, user, pass };
}

export async function sendSecurityMail(to: string, subject: string, text: string) {
  const config = securityMailConfig();
  const transport = nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.port === 465, requireTLS: true,
    auth: { user: config.user, pass: config.pass }, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  try {
    const result = await transport.sendMail({ from: { name: "Mordomê", address: config.from }, to, subject, text });
    if (!result.accepted.length) throw new Error("SECURITY_EMAIL_DELIVERY");
  } finally { transport.close(); }
}
