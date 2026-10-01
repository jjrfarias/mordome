import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { customerCookie, sessionHash } from "./customer-identity";

export async function currentCustomer(establishmentId: string) {
  const token = (await cookies()).get(customerCookie(establishmentId))?.value;
  if (!token) return null;
  const session = await db.customerSession.findFirst({ where: { establishmentId, tokenHash: sessionHash(token), expiresAt: { gt: new Date() }, account: { active: true, establishment: { active: true, organization: { active: true } } } }, include: { account: true } });
  return session ?? null;
}

export async function setCustomerCookie(establishmentId: string, token: string, expires: Date) {
  (await cookies()).set(customerCookie(establishmentId), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}
