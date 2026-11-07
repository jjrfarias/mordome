import { createHash } from "node:crypto";

export function printTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// ESC/POS control characters must never come from catalog/customer text.
export function printerText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, " ").trim();
}

export function kitchenEscpos(ticket: { establishment: string; label: string; orderId: string; sentAt: Date; items: { name: string; quantity: number }[] }) {
  const wrap = (value: string) => printerText(value).match(/.{1,42}(?:\s|$)|.{1,42}/g)?.map(line => line.trim()).join("\n") ?? "";
  const lines = ticket.items.map(item => `${item.quantity}x ${wrap(item.name)}`).join("\n\n");
  return Buffer.concat([
    Buffer.from([27, 64, 27, 97, 1]),
    Buffer.from(`${wrap(ticket.establishment)}\nCOZINHA\n`, "ascii"),
    Buffer.from([29, 33, 17]),
    Buffer.from(`${printerText(ticket.label)}\n`, "ascii"),
    Buffer.from([29, 33, 0, 27, 97, 0, 27, 69, 1]),
    Buffer.from(`------------------------------------------\n${lines}\n`, "ascii"),
    Buffer.from([27, 69, 0]),
    Buffer.from(`------------------------------------------\nPedido: ${printerText(ticket.orderId)}\n${ticket.sentAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n\n\n\n`, "ascii"),
    Buffer.from([29, 86, 1]),
  ]).toString("base64");
}

export function selectedOptionNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(option => option && typeof option === "object" && typeof option.optionName === "string" ? [option.optionName] : []);
}
