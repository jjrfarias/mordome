import assert from "node:assert/strict";
import test from "node:test";
import { createLocalDeliveryArea, getLocalDeliveryArea, listLocalDeliveryAreas, updateLocalDeliveryArea } from "../lib/local-delivery-areas.ts";
import { createLocalCatalogProduct } from "../lib/local-catalog.ts";
import { createLocalDeliveryOrder } from "../lib/local-delivery.ts";

test("Áreas de entrega: criação com nome duplicado é rejeitada", () => {
  const establishmentId = `delivery-area-dup-${Date.now()}`;
  const created = createLocalDeliveryArea(establishmentId, { name: "Costa Azul", deliveryFee: 8 });
  assert.notEqual(created, "DUPLICATE");
  const duplicate = createLocalDeliveryArea(establishmentId, { name: "costa azul", deliveryFee: 9 });
  assert.equal(duplicate, "DUPLICATE");
});

test("Áreas de entrega: inativação não exclui a área (mesmo padrão dos demais cadastros)", () => {
  const establishmentId = `delivery-area-inactivate-${Date.now()}`;
  const area = createLocalDeliveryArea(establishmentId, { name: "Cavaleiros", deliveryFee: 6 });
  assert.notEqual(area, "DUPLICATE"); if (area === "DUPLICATE") return;
  const updated = updateLocalDeliveryArea(establishmentId, area.id, { active: false });
  assert.notEqual(updated, "NOT_FOUND"); assert.notEqual(updated, "DUPLICATE"); if (typeof updated === "string") return;
  assert.equal(updated.active, false);
  // Continua listada (nunca é excluída), apenas marcada como inativa.
  const listed = listLocalDeliveryAreas(establishmentId).find(candidate => candidate.id === area.id);
  assert.ok(listed);
  assert.equal(listed?.active, false);
});

test("Isolamento: áreas de um estabelecimento não aparecem para outro", () => {
  const establishmentId = `delivery-area-iso-a-${Date.now()}`;
  const otherEstablishmentId = `delivery-area-iso-b-${Date.now()}`;
  createLocalDeliveryArea(establishmentId, { name: "Parque Aeroporto", deliveryFee: 10 });
  assert.equal(listLocalDeliveryAreas(otherEstablishmentId).length, 0);
  assert.equal(listLocalDeliveryAreas(establishmentId).length, 1);
});

test("Delivery: pedido com área de entrega aplica a taxa ao total do pedido", () => {
  const establishmentId = `delivery-area-order-${Date.now()}`;
  const area = createLocalDeliveryArea(establishmentId, { name: "Botafogo", deliveryFee: 7.5 });
  assert.notEqual(area, "DUPLICATE"); if (area === "DUPLICATE") return;
  const product = createLocalCatalogProduct(establishmentId, { name: `Combo ${Date.now()}`, category: "Combos", price: 20, channels: ["DELIVERY"] });
  assert.ok(product);
  const order = createLocalDeliveryOrder(establishmentId, { customerName: "Cliente A", customerPhone: "22999990000", address: "Rua X, 1", deliveryAreaId: area.id, deliveryFee: area.deliveryFee, items: [{ productId: product!.id, productName: product!.name, quantity: 1, unitPrice: product!.price }] });
  const itemsTotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  assert.equal(order.deliveryAreaId, area.id);
  assert.equal(order.deliveryFee, 7.5);
  assert.equal(itemsTotal + order.deliveryFee, 27.5);
});

test("Delivery: pedido sem área continua sem taxa (sem regressão)", () => {
  const establishmentId = `delivery-area-no-fee-${Date.now()}`;
  const product = createLocalCatalogProduct(establishmentId, { name: `Lanche ${Date.now()}`, category: "Lanches", price: 15, channels: ["DELIVERY"] });
  assert.ok(product);
  const order = createLocalDeliveryOrder(establishmentId, { customerName: "Cliente B", customerPhone: "22999991111", address: "Rua Y, 2", items: [{ productId: product!.id, productName: product!.name, quantity: 1, unitPrice: product!.price }] });
  assert.equal(order.deliveryAreaId, null);
  assert.equal(order.deliveryFee, 0);
  const itemsTotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  assert.equal(itemsTotal, 15);
});

test("Delivery: área de outro estabelecimento é rejeitada ao validar antes de criar o pedido", () => {
  const establishmentId = `delivery-area-cross-a-${Date.now()}`;
  const otherEstablishmentId = `delivery-area-cross-b-${Date.now()}`;
  const area = createLocalDeliveryArea(otherEstablishmentId, { name: "Área de outra loja", deliveryFee: 5 });
  assert.notEqual(area, "DUPLICATE"); if (area === "DUPLICATE") return;
  // Reproduz a mesma checagem cross-tenant feita em app/api/operations/delivery/route.ts antes de aplicar a taxa.
  const foundInWrongEstablishment = getLocalDeliveryArea(establishmentId, area.id);
  assert.equal(foundInWrongEstablishment, null);
});
