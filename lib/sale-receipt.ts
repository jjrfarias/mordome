import { printerText } from "./kitchen-print.ts";

export type Receipt = {
  delivery?: boolean; notice?: string; totalLabel?: string;
  conference?: boolean;
  establishment: string; document?: string | null; saleId: string; completedAt: Date; label: string;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number; discount: number; serviceAmount: number; serviceWaived?: boolean; deliveryFee: number; total: number;
  payments: { method: string; amount: number; receivedAmount: number | null; changeAmount: number }[];
};
const money = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;
const names: Record<string, string> = { CASH: "Dinheiro", PIX: "Pix", CREDIT_CARD: "Credito", DEBIT_CARD: "Debito", OTHER: "Outros" };
export function saleReceiptEscpos(receipt: Receipt) {
  const width = 48; // 80 mm paper, font A: 48 columns.
  const wrap = (value: string) => printerText(value).match(/.{1,48}/g)?.join("\n") ?? "";
  const rule = "-".repeat(width);
  const digits = receipt.document?.replace(/\D/g, "") ?? "";
  const cnpj = digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : null;
  const columns = (left: string, right: string) => printerText(left).slice(0, width - right.length - 1).padEnd(width - right.length) + right;
  const ascii = (lines: string[]) => Buffer.from(lines.join("\n") + "\n", "ascii");
  return Buffer.concat([
    Buffer.from([27, 64, 27, 77, 0, 27, 97, 1, 27, 69, 1]),
    ascii([wrap(receipt.establishment)]),
    Buffer.from([27, 69, 0]),
    ascii([...(cnpj ? [`CNPJ: ${cnpj}`] : []), receipt.conference ? (receipt.delivery ? "CONFERENCIA DO PEDIDO" : "CONFERENCIA DA COMANDA") : "COMPROVANTE DE VENDA", "SEM VALOR FISCAL", receipt.completedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), wrap(receipt.label), ...(receipt.notice ? [wrap(receipt.notice)] : []), rule]),
    Buffer.from([27, 97, 0]),
    ascii(["ITEM / DESCRICAO", columns("QTD x VALOR UNITARIO", "VALOR TOTAL"), rule,
      ...receipt.items.flatMap((item, index) => [wrap(`${String(index + 1).padStart(3, "0")} ${item.name}`), columns(`${item.quantity} x ${money(item.unitPrice)}`, money(item.total))]),
      rule, columns("Subtotal", money(receipt.subtotal)),
      ...(receipt.discount ? [columns("Desconto", money(receipt.discount))] : []),
      ...(receipt.serviceAmount ? [columns("Servico", money(receipt.serviceAmount))] : []),
      ...(receipt.serviceWaived ? ["Servico retirado a pedido do cliente"] : []),
      ...(receipt.deliveryFee ? [columns("Entrega", money(receipt.deliveryFee))] : [])]),
    Buffer.from([27, 69, 1, 29, 33, 1]),
    ascii([columns(receipt.totalLabel ?? "TOTAL A PAGAR", money(receipt.total))]),
    Buffer.from([29, 33, 0, 27, 69, 0]),
    ascii(receipt.conference ? [rule, "CONTA EM ABERTO - NAO COMPROVA PAGAMENTO", "Valores sujeitos a alteracao ate o fechamento", rule] : [rule, columns("FORMA DE PAGAMENTO", "VALOR"),
      ...receipt.payments.flatMap(payment => [columns(names[payment.method] ?? payment.method, money(payment.amount)),
        ...(payment.receivedAmount !== null ? [columns("Valor recebido", money(payment.receivedAmount))] : []),
        ...(payment.changeAmount ? [columns("Troco", money(payment.changeAmount))] : [])]), rule]),
    Buffer.from([27, 97, 1]),
    ascii([wrap(`${receipt.conference ? (receipt.delivery ? "Pedido" : "Comanda") : "Venda"}: ${receipt.saleId}`), "SEM VALOR FISCAL", "Obrigado pela preferencia!", "", "", "", ""]),
    Buffer.from([27, 97, 0, 29, 86, 1]),
  ]).toString("base64");
}
