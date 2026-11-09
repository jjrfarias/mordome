import { test } from "node:test";
import assert from "node:assert/strict";
import { saleReceiptEscpos } from "../lib/sale-receipt.ts";
import { buildReceiptHtml } from "../lib/integrations/print-client.ts";

test("conference is explicitly unpaid, with no sale or payment confirmation", () => {
  const receipt = { establishment: "Loja", saleId: "tab-123", completedAt: new Date(), label: "Mesa 2 - Ana", items: [{ name: "Pastel - queijo", quantity: 2, unitPrice: 20, total: 40 }], subtotal: 40, serviceAmount: 4, discount: 2, deliveryFee: 0, total: 42, payments: [], conference: true };
  const text = Buffer.from(saleReceiptEscpos(receipt), "base64").toString("ascii");
  assert.match(text, /CONFERENCIA DA COMANDA/);
  assert.match(text, /CONTA EM ABERTO - NAO COMPROVA PAGAMENTO/);
  assert.match(text, /TOTAL A PAGAR\s+R\$ 42,00/);
  assert.match(text, /Comanda: tab-123/);
  assert.doesNotMatch(text, /COMPROVANTE DE VENDA|FORMA DE PAGAMENTO|Venda:/);
});

test("browser conference escapes item names and shows service and discount", () => {
  const html = buildReceiptHtml({ establishmentName: "Loja", channel: "FLOOR", table: 2, items: [{ name: "<script>test</script>", quantity: 2, unitPrice: 20 }], subtotal: 40, serviceAmount: 0, discount: 2, total: 38, payment: "", conference: true });
  assert.match(html, /CONTA EM ABERTO/);
  assert.match(html, /NÃO COMPROVA PAGAMENTO/);
  assert.match(html, /Serviço/);
  assert.match(html, /Desconto/);
  assert.doesNotMatch(html, /<script>|Pagamento:/);
});
