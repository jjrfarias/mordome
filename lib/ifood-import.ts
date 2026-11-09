import { z } from "zod";

const cents = z.number().int().min(0).max(100_000_000);
export const ifoodCaptureSchema = z.object({
  version: z.literal(1),
  provider: z.enum(["IFOOD", "FOOD99"]).optional(),
  externalId: z.string().max(40).transform(value => value.toLowerCase()),
  displayId: z.string().regex(/^\d{1,24}$/),
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
}).superRefine((order, ctx) => {
  const valid = order.provider === "FOOD99" ? /^\d{10,24}$/.test(order.externalId) : z.string().uuid().safeParse(order.externalId).success;
  if (!valid) ctx.addIssue({ code: "custom", path: ["externalId"], message: "Identificador do Gestor inválido" });
});
export type IfoodCapture = z.infer<typeof ifoodCaptureSchema>;
export const ifoodImportSchema = z.object({ establishmentId: z.string().min(1), confirmed: z.literal(true), order: ifoodCaptureSchema });

export function isMarketplaceOrder(origin: string | undefined) { return origin === "IFOOD" || origin === "FOOD99"; }
export function marketplaceLabel(provider?: string) { return provider === "FOOD99" ? "99Food" : "iFood"; }
export function ifoodRequestId(externalId: string, provider?: string) { return `${provider === "FOOD99" ? "99food" : "ifood"}:${externalId.toLowerCase()}`; }
export function ifoodMetadata(value: unknown) {
  const parsed = ifoodCaptureSchema.safeParse(value);
  return parsed.success ? { displayId: parsed.data.displayId, payment: parsed.data.payment, subtotalCents: parsed.data.subtotalCents } : null;
}
export function ifoodImportProblem(order: IfoodCapture): string | null {
  if (/conclu[ií]do|cancelad|saiu para entrega|entregue|em rota/i.test(order.sourceStatus)) return "Este pedido já saiu para entrega ou foi encerrado. Não será enviado novamente para produção.";
  if (order.provider === "FOOD99" && !/^(?:preparando|em preparo|em prepara[çc][aã]o|pedido em preparo)$/i.test(order.sourceStatus.trim())) return "Importe apenas um pedido aceito que esteja em preparo no 99Food.";
  if (order.provider === "FOOD99" && order.deliveryFeeCents !== 0) return "A captura do 99Food deve conter somente o subtotal dos itens.";
  if (order.payment === "UNKNOWN" && order.provider !== "FOOD99") return "Pagamento não identificado. Confira o pedido no Gestor; esta versão não importa pagamento desconhecido.";
  if (order.fulfillment === "DELIVERY" && !order.address.trim()) return "Endereço de entrega não encontrado.";
  const itemsTotal = order.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (itemsTotal + order.deliveryFeeCents !== order.subtotalCents) return "Os itens e a taxa não conferem com o subtotal do Gestor. Não importe até conferir a leitura.";
  return null;
}
export function ifoodPaymentLabel(payment: IfoodCapture["payment"], provider?: string) {
  const label = marketplaceLabel(provider).toUpperCase();
  return payment === "PAID_ONLINE" ? `PAGO NO ${label} — NÃO COBRAR` : payment === "PAY_ON_DELIVERY" ? `COBRAR CONFORME O GESTOR DO ${label}` : `PAGAMENTO NÃO IDENTIFICADO — CONFIRA NO ${label}`;
}
