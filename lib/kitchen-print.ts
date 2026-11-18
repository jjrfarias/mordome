import { createHash } from "node:crypto";

export function printTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// ESC/POS control characters must never come from catalog/customer text.
export function printerText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, " ").trim();
}

export function kitchenEscpos(ticket: { establishment: string; label: string; orderId: string; sentAt: Date; items: { name: string; quantity: number }[] }) {
  const wrap = (value: string, width = 42) => printerText(value).match(new RegExp(`.{1,${width}}(?:\\s|$)|.{1,${width}}`, "g"))?.map(line => line.trim()).join("\n") ?? "";
  // Keep the familiar 80 mm font size and reinforce the print. Wrap the
  // quantity together with the item so the printer never wraps it mid-word.
  const lines = ticket.items.map(item => wrap(`${item.quantity}x ${item.name}`, 42)).join("\n\n");
  return Buffer.concat([
    Buffer.from([27, 64, 27, 97, 1]),
    Buffer.from(`${wrap(ticket.establishment)}\nCOZINHA\n`, "ascii"),
    Buffer.from([29, 33, 17]),
    Buffer.from(`${printerText(ticket.label)}\n`, "ascii"),
    Buffer.from([29, 33, 0, 27, 97, 0]),
    Buffer.from("------------------------------------------\n", "ascii"),
    Buffer.from([27, 69, 1, 27, 71, 1]),
    Buffer.from(`${lines}\n`, "ascii"),
    Buffer.from([27, 69, 0, 27, 71, 0]),
    Buffer.from(`------------------------------------------\nPedido: ${printerText(ticket.orderId)}\n${ticket.sentAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n\n\n\n`, "ascii"),
    Buffer.from([29, 86, 1]),
  ]).toString("base64");
}

export function selectedOptionNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(option => option && typeof option === "object" && typeof option.optionName === "string" ? [option.optionName] : []);
}
