import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { parseWhatsAppAutomation, renderWhatsAppAutomation, type WhatsAppAutomation, type WhatsAppAutomationEventName } from "@/lib/whatsapp-automation-settings";

export { automationEvents, automationSchema, defaultWhatsAppAutomation, parseWhatsAppAutomation, type WhatsAppAutomation, type WhatsAppAutomationEventName } from "@/lib/whatsapp-automation-settings";

export async function readWhatsAppAutomation(establishmentId: string) {
  const connection = await db.whatsAppConnection.findUnique({ where: { establishmentId }, select: { automation: true } });
  return parseWhatsAppAutomation(connection?.automation);
}

export async function writeWhatsAppAutomation(establishmentId: string, automation: WhatsAppAutomation) {
  await db.whatsAppConnection.upsert({ where: { establishmentId }, create: { establishmentId, automation }, update: { automation } });
}

export async function dispatchDeliveryWhatsAppAutomation(orderId: string, event: WhatsAppAutomationEventName) {
  const order = await db.deliveryOrder.findUnique({ where: { id: orderId }, include: { establishment: { select: { name: true } } } });
  if (!order || order.origin !== "ONLINE") return;
  if (event === "INVITE_ACCOUNT" && (order.customerAccountId || !order.accountInviteOptIn)) return;
  const automation = await readWhatsAppAutomation(order.establishmentId);
  const rule = automation[event];
  if (!rule.enabled) return;
  try {
    await db.whatsAppAutomationEvent.create({ data: { establishmentId: order.establishmentId, deliveryOrderId: order.id, event } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
  try {
    await sendWhatsAppMessage(order.establishmentId, order.customerPhone, renderWhatsAppAutomation(rule.text, {
      nome: order.customerName,
      pedido: `#${order.id.slice(-6).toUpperCase()}`,
      estabelecimento: order.establishment.name,
    }));
    await db.whatsAppAutomationEvent.update({ where: { deliveryOrderId_event: { deliveryOrderId: order.id, event } }, data: { sentAt: new Date() } });
  } catch {
    await db.whatsAppAutomationEvent.update({ where: { deliveryOrderId_event: { deliveryOrderId: order.id, event } }, data: { failedAt: new Date() } }).catch(() => {});
  }
}
