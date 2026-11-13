import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryReceipt, type DeliveryPrintOrder } from '../lib/delivery-receipt.ts';
import { saleReceiptEscpos } from '../lib/sale-receipt.ts';
import { buildReceiptHtml } from '../lib/integrations/print-client.ts';
const order: DeliveryPrintOrder = { id: 'order-test', customerName: 'Cliente teste', address: 'Rua Teste, 1', notes: 'Sem talheres', fulfillment: 'DELIVERY', status: 'PREPARING', origin: 'INTERNAL', saleId: null, deliveryFee: 5, items: [{ productName: 'Pastel', quantity: 2, unitPrice: 20, selectedOptionsSnapshot: [{ optionName: 'Queijo extra' }] }] };
test('delivery conference includes extras, fee, discount and does not claim payment', () => {
  const receipt = deliveryReceipt(order, { name: 'Loja' }, 'CONFERENCE', 2);
  assert.equal(receipt.total, 43); assert.equal(receipt.serviceAmount, 0); assert.equal(receipt.deliveryFee, 5);
  assert.match(receipt.label, /Rua Teste, 1/); assert.match(receipt.items[0].name, /Queijo extra/);
  const text = Buffer.from(saleReceiptEscpos(receipt), 'base64').toString('ascii');
  assert.match(text, /CONFERENCIA DO PEDIDO/); assert.match(text, /NAO COMPROVA PAGAMENTO/); assert.match(text, /Entrega\s+R\$ 5,00/);
  assert.deepEqual(receipt.payments, []); assert.equal(order.status, 'PREPARING');
  assert.throws(() => deliveryReceipt(order, { name: 'Loja' }, 'RECEIPT'), /Conclua/);
  assert.throws(() => deliveryReceipt(order, { name: 'Loja' }, 'CONFERENCE', 46), /Desconto/);
});
test('paid receipt uses persisted sale totals and payments instead of current order prices', () => {
  const sale = { id: 'sale', status: 'COMPLETED', completedAt: new Date(), subtotal: 40, discount: 3, serviceAmount: 0, deliveryFee: 5, total: 42, items: [{ productName: 'Pastel', quantity: 2, unitPrice: 20, total: 40 }], payments: [{ method: 'CASH', amount: 42, receivedAmount: 50, changeAmount: 8 }] };
  const paid = { ...order, status: 'DELIVERED', saleId: sale.id, sale, deliveryFee: 90 };
  const receipt = deliveryReceipt(paid, { name: 'Loja' }, 'RECEIPT', 99);
  assert.equal(receipt.total, 42); assert.equal(receipt.discount, 3); assert.equal(receipt.deliveryFee, 5);
  assert.match(Buffer.from(saleReceiptEscpos(receipt), 'base64').toString('ascii'), /Troco\s+R\$ 8,00/);
  assert.throws(() => deliveryReceipt(paid, { name: 'Loja' }, 'CONFERENCE'), /encerrado/);
  assert.throws(() => deliveryReceipt({ ...paid, sale: { ...sale, status: 'CANCELLED' } }, { name: 'Loja' }, 'RECEIPT'), /Conclua/);
});
test('iFood conference prints normal order details without captured Gestor text', () => {
  const imported = { version: 1, externalId: '11111111-1111-4111-8111-111111111111', displayId: '1234', customerName: 'Teste', storeName: 'Loja', sourceStatus: 'Em preparo', address: 'Rua teste', fulfillment: 'DELIVERY', payment: 'PAID_ONLINE', subtotalCents: 1500, deliveryFeeCents: 500, items: [{ name: 'Combo', quantity: 3, lineTotalCents: 1000, details: 'Sem cebola' }], sourceText: 'Pedido de teste' };
  const source = { ...order, origin: 'IFOOD', notes: 'iFood #1234\nAceite, cobrança e entrega no Gestor.\nTexto completo capturado', ifoodImport: { ...imported, orderNotes: 'Sem talheres' } };
  const receipt = deliveryReceipt(source, { name: 'Loja' }, 'CONFERENCE');
  assert.equal(receipt.total, 15); assert.equal(receipt.items[0].total, 10); assert.equal(receipt.totalLabel, 'TOTAL INFORMADO'); assert.equal(receipt.notice, undefined);
  assert.match(receipt.label, /OBS: Sem talheres/); assert.doesNotMatch(receipt.label, /Gestor|Texto completo|iFood/);
  assert.throws(() => deliveryReceipt(source, { name: 'Loja' }, 'RECEIPT'), /iFood/);
  const html = buildReceiptHtml({ establishmentName: 'Loja', channel: 'DELIVERY', conference: true, items: receipt.items, total: receipt.total, payment: '', deliveryFee: 5, notice: receipt.notice });
  assert.match(html, /CONFERÊNCIA DO PEDIDO/); assert.match(html, /Entrega/); assert.doesNotMatch(html, /NÃO COBRAR|Gestor|iFood/);
});
