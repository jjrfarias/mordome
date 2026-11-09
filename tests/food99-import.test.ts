import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { capture99FoodOrder } from "../extensions/ifood-import/capture-99food.js";
import { ifoodCaptureSchema, ifoodImportProblem, ifoodRequestId } from "../lib/ifood-import.ts";
import { deliveryReceipt } from "../lib/delivery-receipt.ts";
import { kitchenOrderLabel } from "../lib/kitchen-label.ts";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
// Anonymized observed 99Food detail structure. Active status is synthetic until a live order is available.
function fixture() {
  const dom = new JSDOM(`<div class="history-detail-drawer__column"><div class="history-detail-drawer__title">#2</div><div class="detail-content">
<div class="store-name__text">Loja Teste</div><span class="order-id">ID: 5764699735319447507</span>
<div class="receiver-and-rider-info-wrapper"><div class="info-wrapper"><div class="text"><p>Cliente Teste</p></div><div class="receiver-address">*** Bairro Teste ***</div></div><span class="status">Em preparo</span></div>
<div class="items-wrapper"><div><div class="remark"><span class="each-remark">Enviar talheres</span></div></div>
<div class="item"><div class="food-item main-item"><div class="count">2 <span>x</span></div><span class="name-text">Pastel Teste</span><span class="final-price"><span class="value">R$ 40,00</span></span></div><div class="subitem-part">2 × Queijo extra</div><div class="item-remark">Sem cebola</div></div></div>
Preço total dos itens sem as ofertas\nR$ 40,00\nGanhos com pedido\nR$ 27,32\nValor do pagamento\nR$ 27,32</div></div>`, { url: "https://merchant.99app.com/pt-BR/store/pc-v2/order" });
  Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
  dom.window.HTMLElement.prototype.getClientRects = () => [{}];
  Object.assign(globalThis, { document: dom.window.document, location: dom.window.location });
  return dom;
}
test("99Food: ID longo exato, preço da linha, adicionais, notas e subtotal sem repasse", () => {
  const dom = fixture(); try {
    const result = capture99FoodOrder();
    assert.equal(result.externalId, "5764699735319447507"); assert.equal(result.displayId, "2");
    assert.equal(result.payment, "UNKNOWN"); assert.equal(result.subtotalCents, 4000);
    assert.equal(result.items[0].quantity, 2); assert.equal(result.items[0].lineTotalCents, 4000);
    assert.match(result.items[0].details, /2 × Queijo extra\nSem cebola/); assert.equal(result.orderNotes, "Enviar talheres");
    const parsed = ifoodCaptureSchema.parse(result); assert.equal(ifoodImportProblem(parsed), null);
    assert.notEqual(ifoodRequestId(result.externalId, "FOOD99"), ifoodRequestId(result.externalId));
    assert.notEqual(ifoodRequestId(result.externalId, "FOOD99"), ifoodRequestId("5764699735319447508", "FOOD99"));
    assert.equal(ifoodCaptureSchema.safeParse({...result, provider:"IFOOD"}).success, false);
    for (const sourceStatus of ["Concluído", "Cancelado", "Entregando", "O cliente recebeu o pedido", "Não aceita", "Desconhecido"]) assert.ok(ifoodImportProblem({...parsed, sourceStatus}));
    assert.ok(ifoodImportProblem({...parsed, subtotalCents:2732}));
  } finally { dom.window.close(); }
});
test("99Food: falha fechada para dados incompletos e múltiplos pedidos", () => {
  for (const selector of [".order-id", ".store-name__text", ".status", ".count", ".final-price", ".item"]) {
    const dom = fixture(); try { dom.window.document.querySelector(selector).remove(); assert.throws(capture99FoodOrder); } finally { dom.window.close(); }
  }
  const dom = fixture(); try { const root=dom.window.document.querySelector(".detail-content");root.parentElement.append(root.cloneNode(true));assert.throws(capture99FoodOrder,/único/); } finally { dom.window.close(); }
});
test("99Food: conferência e cozinha identificam origem sem criar comprovante pago", () => {
  const dom = fixture(); try {
    const data = capture99FoodOrder();
    const order = {id:"qa", origin:"FOOD99", status:"PREPARING", saleId:null, customerName:"Teste", address:"Teste", notes:null, deliveryFee:0, ifoodImport:data, items:[]};
    const receipt = deliveryReceipt(order, {name:"QA"}, "CONFERENCE");
    assert.equal(receipt.total,40); assert.match(receipt.totalLabel!,/99FOOD/); assert.match(receipt.notice!,/PAGAMENTO NÃO IDENTIFICADO/);
    assert.throws(()=>deliveryReceipt(order,{name:"QA"},"RECEIPT"), /Gestor/);
    assert.equal(kitchenOrderLabel({tableNumber:0,isCounter:true,delivery:{deliveryOrderId:"qa",origin:"FOOD99",customerName:"Teste",externalNumber:"2"}}).kicker,"99Food");
  } finally { dom.window.close(); }
});
