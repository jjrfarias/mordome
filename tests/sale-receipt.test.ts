import { test } from "node:test";
import assert from "node:assert/strict";
import { saleReceiptEscpos } from "../lib/sale-receipt.ts";

test("receipt uses persisted totals, split payments, change and explicit non-fiscal label", () => {
  const bytes = Buffer.from(saleReceiptEscpos({ establishment: "Ponto do Recheio", saleId: "teste", completedAt: new Date("2026-11-09T00:00:00Z"), label: "Mesa 3", items: [{ name: "Pastel\x1b@ - queijo extra", quantity: 2, unitPrice: 25, total: 50 }], subtotal: 50, discount: 5, serviceAmount: 5, deliveryFee: 3, total: 53, payments: [{ method: "PIX", amount: 20, receivedAmount: null, changeAmount: 0 }, { method: "CASH", amount: 33, receivedAmount: 50, changeAmount: 17 }] }), "base64");
  const text = bytes.toString("ascii");
  const normalized = text.replace(/ +/g, " ");
  for (const expected of ["SEM VALOR FISCAL", "2 x R$ 25,00 R$ 50,00", "TOTAL A PAGAR R$ 53,00", "Desconto R$ 5,00", "Servico R$ 5,00", "Entrega R$ 3,00", "Pix R$ 20,00", "Valor recebido R$ 50,00", "Troco R$ 17,00", "08/11/2026", "21:00:00"]) assert.ok(normalized.includes(expected), expected);
  assert.equal(text.split("\x1b@").length - 1, 1, "catalog cannot inject initialization");
  assert.ok(bytes.includes(Buffer.from([27, 97, 1])), "centered header/footer");
  assert.deepEqual([...bytes.subarray(-3)], [29, 86, 1]);
});

test("CNPJ is printed only when the unit registration contains one", () => {
  const base = { establishment: "QA", saleId: "test", completedAt: new Date(), label: "Balcao", items: [], subtotal: 0, discount: 0, serviceAmount: 0, deliveryFee: 0, total: 0, payments: [] };
  const text = (document?: string | null) => Buffer.from(saleReceiptEscpos({ ...base, document }), "base64").toString("ascii");
  assert.ok(text("12345678000195").includes("CNPJ: 12.345.678/0001-95"));
  assert.ok(text("12.345.678/0001-95").includes("CNPJ: 12.345.678/0001-95"));
  for (const document of [undefined, null, "", "12345678901"]) assert.ok(!text(document).includes("CNPJ:"));
});

test("receipt identifies service waived at the customer's request", () => {
  const text = Buffer.from(saleReceiptEscpos({ establishment: "QA", saleId: "test", completedAt: new Date(), label: "Mesa 3", items: [], subtotal: 20, discount: 0, serviceAmount: 0, serviceWaived: true, deliveryFee: 0, total: 20, payments: [] }), "base64").toString("ascii");
  assert.ok(text.includes("Servico retirado a pedido do cliente"));
  assert.match(text, /TOTAL A PAGAR\s+R\$ 20,00/);
});
