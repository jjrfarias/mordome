import { z } from "zod";

const cents = z.number().int().min(0).max(100_000_000);
export const ifoodCaptureSchema = z.object({
  version: z.literal(1),
  externalId: z.string().uuid().transform(value => value.toLowerCase()),
  displayId: z.string().regex(/^\d{1,10}$/),
  customerName: z.string().trim().min(1).max(150),
  storeName: z.string().trim().min(1).max(200),
  sourceStatus: z.string().trim().min(1).max(200),
  address: z.string().max(2000),
  fulfillment: z.enum(["DELIVERY", "PICKUP"]),
  payment: z.enum(["PAID_ONLINE", "PAY_ON_DELIVERY", "UNKNOWN"]),
  deliveryFeeCents: cents,
  subtotalCents: cents,
  orderNotes: z.string().max(4000).default(""),
  items: z.array(z.object({ name: z.string().trim().min(1).max(300), quantity: z.number().int().min(1).max(99), lineTotalCents: cents, details: z.string().max(4000) })).min(1).max(100),
  sourceText: z.string().min(1).max(40000),
});
export type IfoodCapture = z.infer<typeof ifoodCaptureSchema>;
export const ifoodImportSchema = z.object({ establishmentId: z.string().min(1), confirmed: z.literal(true), order: ifoodCaptureSchema });

export function ifoodRequestId(externalId: string) { return `ifood:${externalId.toLowerCase()}`; }
export function ifoodMetadata(value: unknown) {
  const parsed = ifoodCaptureSchema.safeParse(value);
  return parsed.success ? { displayId: parsed.data.displayId, payment: parsed.data.payment, subtotalCents: parsed.data.subtotalCents } : null;
}
export function ifoodImportProblem(order: IfoodCapture): string | null {
  if (/conclu[ií]do|cancelad|saiu para entrega|entregue|em rota/i.test(order.sourceStatus)) return "Este pedido já saiu para entrega ou foi encerrado. Não será enviado novamente para produção.";
  if (order.payment === "UNKNOWN") return "Pagamento não identificado. Confira o pedido no Gestor; esta versão não importa pagamento desconhecido.";
  if (order.fulfillment === "DELIVERY" && !order.address.trim()) return "Endereço de entrega não encontrado.";
  const itemsTotal = order.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (itemsTotal + order.deliveryFeeCents !== order.subtotalCents) return "Os itens e a taxa não conferem com o subtotal do Gestor. Não importe até conferir a leitura.";
  return null;
}
export function ifoodPaymentLabel(payment: IfoodCapture["payment"]) {
  return payment === "PAID_ONLINE" ? "PAGO NO IFOOD — NÃO COBRAR" : payment === "PAY_ON_DELIVERY" ? "COBRAR CONFORME O GESTOR DO IFOOD" : "PAGAMENTO NÃO IDENTIFICADO";
}
