import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptHtml } from "../lib/integrations/print-client.ts";
import { DEFAULT_PRINT_TEMPLATE, getLocalPrintTemplate, upsertLocalPrintTemplate } from "../lib/local-print-templates.ts";

const baseInput = { establishmentName: "Betão Hot Dog", items: [{ name: "X-Salada", quantity: 1, unitPrice: 20 }], total: 20, payment: "Pix", channel: "POS" as const };

test("Recibo sem template configurado mantém o comportamento atual (sem regressão)", () => {
  const html = buildReceiptHtml(baseInput);
  assert.match(html, /width:280px/);
  assert.ok(!html.includes("undefined"));
  assert.equal(html.includes("Volte sempre"), false);
});

test("Recibo com template customizado aplica header, footer, documento e largura", () => {
  const html = buildReceiptHtml(baseInput, { headerText: "Rua das Flores, 123", footerText: "Volte sempre! Família Betão", showDocument: true, paperWidth: 58, establishmentDocument: "12.345.678/0001-99" });
  assert.match(html, /width:200px/);
  assert.match(html, /Rua das Flores, 123/);
  assert.match(html, /Volte sempre! Família Betão/);
  assert.match(html, /12\.345\.678\/0001-99/);
});

test("showDocument sem documento cadastrado não quebra e não exibe nada", () => {
  const html = buildReceiptHtml(baseInput, { showDocument: true, establishmentDocument: null });
  assert.equal(html.includes("null"), false);
});

test("Modelo de impressão local: upsert cria e depois atualiza o mesmo registro", () => {
  const establishmentId = `print-tpl-${Date.now()}`;
  assert.deepEqual(getLocalPrintTemplate(establishmentId), DEFAULT_PRINT_TEMPLATE);
  const created = upsertLocalPrintTemplate(establishmentId, { headerText: "Endereço", footerText: null, showDocument: false, paperWidth: 80 });
  assert.equal(created.headerText, "Endereço");
  const updated = upsertLocalPrintTemplate(establishmentId, { headerText: "Novo endereço", footerText: "Obrigado", showDocument: true, paperWidth: 58 });
  assert.equal(updated.headerText, "Novo endereço");
  assert.equal(updated.showDocument, true);
  assert.equal(updated.paperWidth, 58);
  assert.equal(getLocalPrintTemplate(establishmentId).footerText, "Obrigado");
});

test("Isolamento: template de um estabelecimento não vaza para outro", () => {
  const establishmentA = `print-tpl-a-${Date.now()}`;
  const establishmentB = `print-tpl-b-${Date.now()}`;
  upsertLocalPrintTemplate(establishmentA, { headerText: "A", footerText: null, showDocument: false, paperWidth: 80 });
  assert.deepEqual(getLocalPrintTemplate(establishmentB), DEFAULT_PRINT_TEMPLATE);
  assert.equal(getLocalPrintTemplate(establishmentA).headerText, "A");
});
