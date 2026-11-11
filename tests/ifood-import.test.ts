import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { captureIfoodOrder } from "../extensions/ifood-import/capture.js";
import { ifoodCaptureSchema, ifoodImportProblem, ifoodRequestId } from "../lib/ifood-import.ts";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
// Anonymized fixture matching the observed Gestor DOM, including quantity rendered via CSS.
function fixture({ quantity = "2", body = "", price = "58,00", status = "Em preparo", extra = "" } = {}) {
  const dom = new JSDOM(`<button>Loja de teste\nLoja aberta</button><div class="OrderDetails__content"><h2>4228 Cliente Teste</h2><div class="OrderDetails__status-info"><h3>${status}</h3></div><div class="DetailsDeliverySectionItem">Rua de teste, 1\nEntrega parceira</div><ul><li><div class="SectionItem"><div class="SectionItem__header"><div data-quantity="${quantity}"></div><div class="SectionItem__label--title">Pastel de Carne</div><span data-test-id="item-price">R$ ${price}</span></div><div class="SectionItem__body">${body}</div></div></li></ul>Taxa de entrega\nR$ 11,99\nSubtotal\nR$ 69,99\nPago via iFood, não precisa cobrar na entrega${extra}</div>`, { url: "https://gestordepedidos.ifood.com.br/#/home/order-display/kanban/11111111-1111-4111-8111-111111111111" });
  Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
  dom.window.HTMLElement.prototype.getClientRects = () => [{}];
  Object.assign(globalThis, { document: dom.window.document, location: dom.window.location });
  return dom;
}
test("DOM real: quantidade em data-quantity e preço da linha, não preço unitário", () => {
  const dom = fixture();
  try {
    const result = captureIfoodOrder();
    assert.equal(result.items[0].quantity, 2);
    assert.equal(result.items[0].lineTotalCents, 5800);
    assert.equal(result.payment, "PAID_ONLINE");
    assert.equal(result.subtotalCents, 6999);
    assert.equal(ifoodCaptureSchema.safeParse(result).success, true);
    assert.equal(ifoodImportProblem(result), null);
  } finally { dom.window.close(); }
});
test("preserva adicionais, observações e incentivos sem tratá-los como produtos", () => {
  const dom = fixture({ body: "2 × Queijo extra\nSem cebola", extra: "\nIncentivos iFood\n-R$ 33,07\nTaxa de serviço\nR$ 1,45" });
  try {
    const result = captureIfoodOrder();
    assert.equal(result.items.length, 1);
    assert.match(result.items[0].details, /Sem cebola/);
    assert.match(result.sourceText, /Incentivos/);
  } finally { dom.window.close(); }
});
test("falha fechada quando quantidade, preço ou painel mudam", () => {
  for (const input of [{ quantity: "" }, { quantity: "0" }, { price: "indisponível" }]) {
    const dom = fixture(input);
    try { assert.throws(captureIfoodOrder); } finally { dom.window.close(); }
  }
  const dom = fixture();
  try {
    dom.window.document.querySelector(".OrderDetails__content").remove();
    assert.throws(captureIfoodOrder, /detalhes/);
  } finally { dom.window.close(); }
});
test("painéis ambíguos não são importados e UUID distingue números curtos repetidos", () => {
  const dom = fixture();
  try {
    const panel = dom.window.document.querySelector(".OrderDetails__content");
    panel.parentElement.append(panel.cloneNode(true));
    assert.throws(captureIfoodOrder, /único/);
    assert.notEqual(ifoodRequestId("11111111-1111-4111-8111-111111111111"), ifoodRequestId("22222222-2222-4222-8222-222222222222"));
  } finally { dom.window.close(); }
});
test("observação geral e quantidade de adicional permanecem na captura", () => {
  const dom = fixture({ body: '<div class="SectionItem"><div data-quantity="2"></div><span class="SectionItem__label">Queijo extra</span></div>', extra: '<div class="SectionItem"><div class="SectionItem__label">Observações</div>Não enviar talheres</div>' });
  try {
    const result = captureIfoodOrder();
    assert.match(result.items[0].details, /2 × Queijo extra/);
    assert.match(result.orderNotes, /Não enviar talheres/);
  } finally { dom.window.close(); }
});
test("bloqueia histórico, divergência de valores e pagamento desconhecido", () => {
  const dom = fixture();
  try {
    const order = captureIfoodOrder();
    for (const sourceStatus of ["Concluído", "Cancelado", "Entregador saiu para entrega", "Em rota"]) assert.ok(ifoodImportProblem({ ...order, sourceStatus }));
    assert.ok(ifoodImportProblem({ ...order, subtotalCents: 1 }));
    assert.ok(ifoodImportProblem({ ...order, payment: "UNKNOWN" }));
    assert.equal(ifoodRequestId(order.externalId), ifoodRequestId(order.externalId.toUpperCase()));
    assert.equal(ifoodCaptureSchema.safeParse({ ...order, externalId: "4228" }).success, false);
  } finally { dom.window.close(); }
});


test("identifica loja no seletor semântico do Gestor, sem exigir tag button", () => {
  const dom = fixture();
  try {
    dom.window.document.querySelector("button").outerHTML = '<div role="button"><span>Loja de teste</span>\n<span data-testid="button-merchant-status">Loja aberta</span></div>';
    const order = captureIfoodOrder();
    assert.equal(order.storeName, "Loja de teste");
    assert.equal(ifoodCaptureSchema.safeParse(order).success, true);
    assert.equal(ifoodImportProblem(order), null);
  } finally { dom.window.close(); }
});

test("loja ausente ou ambígua interrompe captura antes de abrir o Mordomê", () => {
  for (const ambiguous of [false, true]) {
    const dom = fixture();
    try {
      if (ambiguous) dom.window.document.body.insertAdjacentHTML("beforeend", '<div role="button">Outra loja\nLoja fechada</div>');
      else dom.window.document.querySelector("button").remove();
      assert.throws(captureIfoodOrder, /identificar a loja/);
    } finally { dom.window.close(); }
  }
});

const newPaymentNotice = "Cobrar do cliente - via iFood\nR$ 38,18\nO iFood já recebeu este valor e vamos repassar para sua\nloja.";
test("reconhece o aviso completo de repasse do Gestor e recupera extensões antigas", () => {
  const dom = fixture();
  try {
    const root = dom.window.document.querySelector(".OrderDetails__content");
    root.innerHTML = root.innerHTML.replace("Pago via iFood, não precisa cobrar na entrega", newPaymentNotice);
    const captured = captureIfoodOrder();
    assert.equal(captured.payment, "PAID_ONLINE");
    const legacy = ifoodCaptureSchema.parse({ ...captured, payment: "UNKNOWN" });
    assert.equal(legacy.payment, "PAID_ONLINE");
    assert.equal(ifoodImportProblem(legacy), null);
    assert.equal(ifoodRequestId(legacy.externalId), ifoodRequestId(captured.externalId));
    assert.equal(ifoodCaptureSchema.parse({ ...captured, payment: "PAY_ON_DELIVERY" }).payment, "PAY_ON_DELIVERY");
  } finally { dom.window.close(); }
});
test("não infere pagamento apenas por via iFood, cobrança ou aviso incompleto", () => {
  for (const notice of ["via iFood", "Cobrar do cliente - via iFood\nR$ 38,18", "O iFood já recebeu este valor", "Cobrar do cliente - via iFood\nR$ 38,18\nO iFood não recebeu este valor", "Pagamento na entrega"]) {
    const dom = fixture();
    try {
      const root = dom.window.document.querySelector(".OrderDetails__content");
      root.innerHTML = root.innerHTML.replace("Pago via iFood, não precisa cobrar na entrega", notice);
      const captured = captureIfoodOrder();
      assert.equal(captured.payment, notice === "Pagamento na entrega" ? "PAY_ON_DELIVERY" : "UNKNOWN");
      assert.equal(ifoodCaptureSchema.parse({ ...captured, payment: "UNKNOWN" }).payment, "UNKNOWN");
    } finally { dom.window.close(); }
  }
});
