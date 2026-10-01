import { z } from "zod";

export const automationEvents = ["ORDER_RECEIVED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "INVITE_ACCOUNT"] as const;
export type WhatsAppAutomationEventName = typeof automationEvents[number];

const template = z.object({ enabled: z.boolean(), text: z.string().trim().min(1).max(500) });
export const automationSchema = z.object({
  ORDER_RECEIVED: template,
  PREPARING: template,
  OUT_FOR_DELIVERY: template,
  DELIVERED: template,
  INVITE_ACCOUNT: template,
});
export type WhatsAppAutomation = z.infer<typeof automationSchema>;

export const defaultWhatsAppAutomation: WhatsAppAutomation = {
  ORDER_RECEIVED: { enabled: false, text: "Olá, {{nome}}! Recebemos seu pedido {{pedido}} em {{estabelecimento}}." },
  PREPARING: { enabled: false, text: "Olá, {{nome}}! Seu pedido {{pedido}} entrou em preparo." },
  OUT_FOR_DELIVERY: { enabled: false, text: "Olá, {{nome}}! Seu pedido {{pedido}} saiu para entrega." },
  DELIVERED: { enabled: false, text: "Olá, {{nome}}! Seu pedido {{pedido}} foi concluído. Obrigado pela preferência!" },
  INVITE_ACCOUNT: { enabled: true, text: "Olá, {{nome}}! Crie sua conta em {{estabelecimento}} para acompanhar pedidos e participar dos futuros programas da loja." },
};

export function parseWhatsAppAutomation(value: unknown): WhatsAppAutomation {
  const parsed = automationSchema.safeParse(value);
  return parsed.success ? parsed.data : structuredClone(defaultWhatsAppAutomation);
}

export function renderWhatsAppAutomation(templateText: string, values: Record<string, string>) {
  return templateText.replace(/{{(nome|pedido|estabelecimento)}}/g, (_, key: string) => values[key] ?? "");
}
