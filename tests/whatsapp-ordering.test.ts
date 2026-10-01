import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWhatsAppText, parseNumberChoice, publicOrderUrl } from "../lib/whatsapp-ordering-helpers.ts";

test("atendimento WhatsApp normaliza comando e escolhas numeradas", () => {
  assert.equal(normalizeWhatsAppText("  CARDÁPIO  "), "cardapio");
  assert.deepEqual(parseNumberChoice("2x 4"), { quantity: 2, index: 4 });
  assert.deepEqual(parseNumberChoice(" 3 "), { quantity: 1, index: 3 });
  assert.equal(parseNumberChoice("quero pastel"), null);
});

test("link de pedido usa a vitrine pública da unidade", () => {
  assert.match(publicOrderUrl("unidade-teste"), /\/pedido-online\/unidade-teste$/);
});
