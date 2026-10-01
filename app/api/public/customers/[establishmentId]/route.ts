import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/auth";
import { currentCustomer, setCustomerCookie } from "@/lib/customer-session";
import { codeMatches, customerCookie, customerPhone, identityHash, newCustomerCode, newCustomerToken, sessionHash } from "@/lib/customer-identity";
import { customerLoginConfigured, whatsappGateway } from "@/lib/whatsapp-gateway";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ establishmentId: string }> };
const headers = { "Cache-Control": "no-store, private" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("REQUEST_CODE"), phone: z.string().max(30) }),
  z.object({ action: z.literal("VERIFY_CODE"), challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/), name: z.string().trim().min(2).max(100) }),
  z.object({ action: z.literal("LOGOUT") }),
]);

export async function GET(_request: Request, { params }: Context) {
  const { establishmentId } = await params;
  if (!customerLoginConfigured()) return reply({ enabled: false, account: null });
  const session = await currentCustomer(establishmentId);
  if (!session) {
    const ready = await whatsappGateway(establishmentId, "status").then(value => value.status === "READY").catch(() => false);
    return reply({ enabled: ready, account: null });
  }
  const where = { establishmentId, customerAccountId: session.accountId };
  const [orders, totalOrders, completedOrders] = await Promise.all([
    db.deliveryOrder.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, status: true, createdAt: true, deliveryFee: true, sale: { select: { total: true } }, items: { select: { productName: true, quantity: true, unitPrice: true, selectedOptionsSnapshot: true } } } }),
    db.deliveryOrder.count({ where }),
    db.deliveryOrder.count({ where: { ...where, status: "DELIVERED", sale: { status: "COMPLETED", refunds: { none: {} } } } }),
  ]);
  return reply({ enabled: true, account: { name: session.account.name, phone: session.account.phone }, totalOrders, completedOrders,
    orders: orders.map(({ sale, ...order }) => ({ ...order,
      totalCents: (sale?.total ?? order.items.reduce((sum, item) => sum.plus(item.unitPrice.times(item.quantity)), order.deliveryFee ?? new Prisma.Decimal(0))).times(100).toNumber(),
      deliveryFee: order.deliveryFee === null ? null : Number(order.deliveryFee), items: order.items.map(item => ({ ...item, unitPrice: Number(item.unitPrice) })) })) });
}

export async function POST(request: Request, { params }: Context) {
  if (!isSameOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Origem inválida." }, 403);
  if (!customerLoginConfigured()) return reply({ error: "Acesso por WhatsApp indisponível. Você pode pedir sem cadastro." }, 503);
  const { establishmentId } = await params;
  const unit = await db.establishment.findFirst({ where: { id: establishmentId, active: true, organization: { active: true } }, select: { id: true } });
  if (!unit) return reply({ error: "Unidade não encontrada." }, 404);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Confira os dados informados." }, 400);
  const data = parsed.data;
  const ipHash = identityHash(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown");
  if (!rateLimit(`customer-auth:${ipHash}`, 60, 10 * 60000).allowed) return reply({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429);
  try {
    if (data.action === "LOGOUT") {
      const session = await currentCustomer(establishmentId);
      if (session) await db.$transaction([
        db.customerSession.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } }),
        db.customerAccountEvent.create({ data: { establishmentId, accountId: session.accountId, action: "LOGOUT" } }),
      ]);
      (await cookies()).delete(customerCookie(establishmentId));
      return reply({ ok: true });
    }
    if (data.action === "REQUEST_CODE") {
      const phone = customerPhone(data.phone);
      if (!phone) return reply({ error: "Informe um celular brasileiro com DDD." }, 400);
      const ready = await whatsappGateway(establishmentId, "status");
      if (ready.status !== "READY") return reply({ error: "WhatsApp indisponível. Você pode pedir sem cadastro." }, 503);
      const id = randomUUID(), code = newCustomerCode();
      const created = await db.$transaction(async tx => {
        const since = new Date(Date.now() - 3600000);
        const [phoneAttempts, ipAttempts, unitAttempts, last] = await Promise.all([
          tx.customerChallenge.count({ where: { establishmentId, phone, createdAt: { gt: since } } }),
          tx.customerChallenge.count({ where: { ipHash, createdAt: { gt: since } } }),
          tx.customerChallenge.count({ where: { establishmentId, createdAt: { gt: since } } }),
          tx.customerChallenge.findFirst({ where: { establishmentId, phone }, orderBy: { createdAt: "desc" } }),
        ]);
        if (phoneAttempts >= 5 || ipAttempts >= 20 || unitAttempts >= 100 || (last && Date.now() - last.createdAt.getTime() < 60000)) return false;
        await tx.customerChallenge.updateMany({ where: { establishmentId, phone, consumed: false }, data: { consumed: true } });
        await tx.customerChallenge.create({ data: { id, establishmentId, phone, ipHash, codeHash: identityHash(`${establishmentId}:${id}:${code}`), expiresAt: new Date(Date.now() + 5 * 60000) } });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (!created) return reply({ error: "Aguarde antes de solicitar outro código." }, 429);
      try {
        await whatsappGateway(establishmentId, "send-code", { phone, code, requestId: id });
        await db.customerChallenge.update({ where: { id }, data: { sent: true } });
      } catch {
        await db.customerChallenge.update({ where: { id }, data: { consumed: true } });
        return reply({ error: "Não foi possível enviar o código. Você pode pedir sem cadastro." }, 503);
      }
      return reply({ challengeId: id, expiresIn: 300 });
    }
    const token = newCustomerToken(), expires = new Date(Date.now() + 7 * 86400000);
    const account = await db.$transaction(async tx => {
      const challenge = await tx.customerChallenge.findFirst({ where: { id: data.challengeId, establishmentId, sent: true, consumed: false, attempts: { lt: 5 }, expiresAt: { gt: new Date() } } });
      if (!challenge) return null;
      await tx.customerChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      if (!codeMatches(establishmentId, challenge.id, data.code, challenge.codeHash)) return null;
      await tx.customerChallenge.update({ where: { id: challenge.id }, data: { consumed: true } });
      const account = await tx.customerAccount.upsert({ where: { establishmentId_phone: { establishmentId, phone: challenge.phone } }, create: { establishmentId, phone: challenge.phone, name: data.name }, update: { verifiedAt: new Date() } });
      if (!account.active) return null;
      const old = (await cookies()).get(customerCookie(establishmentId))?.value;
      if (old) await tx.customerSession.updateMany({ where: { establishmentId, tokenHash: sessionHash(old) }, data: { expiresAt: new Date(0) } });
      await tx.customerSession.create({ data: { establishmentId, accountId: account.id, tokenHash: sessionHash(token), expiresAt: expires } });
      await tx.customerAccountEvent.create({ data: { establishmentId, accountId: account.id, action: "LOGIN" } });
      return account;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!account) return reply({ error: "Código inválido ou expirado. Confira ou solicite outro." }, 400);
    await setCustomerCookie(establishmentId, token, expires);
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return reply({ error: "Solicitação em andamento. Aguarde e tente novamente." }, 409);
    console.error({ event: "customer_auth_failed", establishmentId });
    return reply({ error: "Acesso indisponível no momento. Você pode pedir sem cadastro." }, 503);
  }
}
