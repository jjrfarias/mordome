import assert from "node:assert/strict";
import test from "node:test";
import { defaultWhatsAppAutomation, formatWhatsAppOrderItems, parseWhatsAppAutomation, renderWhatsAppAutomation } from "../lib/whatsapp-automation-settings.ts";

test("WhatsApp automations keep the invite enabled and delivery notifications disabled by default", () => {
  assert.equal(defaultWhatsAppAutomation.INVITE_ACCOUNT.enabled, true);
  assert.equal(defaultWhatsAppAutomation.ORDER_RECEIVED.enabled, false);
  assert.equal(defaultWhatsAppAutomation.PREPARING.enabled, false);
  assert.equal(defaultWhatsAppAutomation.OUT_FOR_DELIVERY.enabled, false);
  assert.equal(defaultWhatsAppAutomation.DELIVERED.enabled, false);
});

test("WhatsApp automation rejects incomplete configuration and renders only known variables", () => {
  const automation = parseWhatsAppAutomation({ INVITE_ACCOUNT: { enabled: true, text: "x" } });
  assert.deepEqual(automation, defaultWhatsAppAutomation);
  assert.equal(renderWhatsAppAutomation("Olá {{nome}}, pedido {{pedido}} em {{estabelecimento}}. {{itens}} {{desconhecida}}", { nome: "Ana", pedido: "#ABC123", estabelecimento: "Mordomê", itens: "2x Pastel" }), "Olá Ana, pedido #ABC123 em Mordomê. 2x Pastel {{desconhecida}}");
});

test("WhatsApp order confirmation lists quantities and selected extras", () => {
  assert.equal(formatWhatsAppOrderItems([{ quantity: 2, productName: "Pastel", selectedOptionsSnapshot: [{ groupName: "Adicionais", optionName: "Bacon", priceDelta: 2 }] }, { quantity: 1, productName: "Guaraná", selectedOptionsSnapshot: null }]), "2x Pastel (Bacon)\n1x Guaraná");
});
