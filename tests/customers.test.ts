import assert from "node:assert/strict";
import test from "node:test";
import { createLocalCustomer, findLocalCustomerByPhone, findOrCreateLocalCustomerByPhone, listLocalCustomers, normalizePhone, updateLocalCustomer } from "../lib/local-customers.ts";
import { changeLocalDeliveryStatus, createLocalDeliveryOrder, getLocalCustomerOrderStats } from "../lib/local-delivery.ts";

test("telefone é normalizado e reconhece formatos diferentes como o mesmo cliente", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const created = createLocalCustomer(orgId, { name: "Maria", phone: "(21) 99999-0000" });
  assert.notEqual(created, "DUPLICATE_PHONE"); if (created === "DUPLICATE_PHONE") return;
  assert.equal(created.phone, "21999990000");
  assert.equal(findLocalCustomerByPhone(orgId, "21 99999 0000")?.id, created.id);
  assert.equal(normalizePhone("(21) 99999-0000"), "21999990000");
});

test("telefone duplicado na mesma organização é rejeitado", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  createLocalCustomer(orgId, { name: "Ana", phone: "21988887777" });
  const duplicate = createLocalCustomer(orgId, { name: "Outra pessoa", phone: "(21) 98888-7777" });
  assert.equal(duplicate, "DUPLICATE_PHONE");
});

test("cadastro de clientes isola por organização", () => {
  const orgA = `org-${crypto.randomUUID()}`;
  const orgB = `org-${crypto.randomUUID()}`;
  createLocalCustomer(orgA, { name: "Cliente A", phone: "21900000001" });
  createLocalCustomer(orgB, { name: "Cliente B", phone: "21900000002" });
  assert.equal(listLocalCustomers(orgA).length, 1);
  assert.equal(listLocalCustomers(orgA)[0]?.name, "Cliente A");
  assert.equal(findLocalCustomerByPhone(orgB, "21900000001"), null);
});

test("busca por nome ou telefone filtra a listagem", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  createLocalCustomer(orgId, { name: "João Silva", phone: "21911112222" });
  createLocalCustomer(orgId, { name: "Maria Souza", phone: "21933334444" });
  assert.equal(listLocalCustomers(orgId, "joão").length, 1);
  assert.equal(listLocalCustomers(orgId, "3333").length, 1);
  assert.equal(listLocalCustomers(orgId, "inexistente").length, 0);
});

test("editar cliente rejeita telefone duplicado de outro cadastro", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  createLocalCustomer(orgId, { name: "Primeiro", phone: "21955556666" });
  const second = createLocalCustomer(orgId, { name: "Segundo", phone: "21977778888" });
  assert.notEqual(second, "DUPLICATE_PHONE"); if (second === "DUPLICATE_PHONE") return;
  assert.equal(updateLocalCustomer(orgId, second.id, { phone: "21955556666" }), "DUPLICATE_PHONE");
  const renamed = updateLocalCustomer(orgId, second.id, { name: "Segundo Editado" });
  assert.notEqual(renamed, "NOT_FOUND"); assert.notEqual(renamed, "DUPLICATE_PHONE");
  if (typeof renamed === "string") return;
  assert.equal(renamed.name, "Segundo Editado");
});

// ADR 0047: reconhecimento automático ao criar um pedido de delivery — encontra pelo telefone ou
// cadastra na hora, sem exigir cadastro manual prévio.
test("findOrCreateLocalCustomerByPhone reconhece cliente repetido e atualiza o nome", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const first = findOrCreateLocalCustomerByPhone(orgId, { name: "Cliente Novo", phone: "21966665555" });
  assert.equal(listLocalCustomers(orgId).length, 1);
  const second = findOrCreateLocalCustomerByPhone(orgId, { name: "Cliente Novo (nome atualizado)", phone: "(21) 96666-5555" });
  assert.equal(second.id, first.id);
  assert.equal(listLocalCustomers(orgId).length, 1);
  assert.equal(findLocalCustomerByPhone(orgId, "21966665555")?.name, "Cliente Novo (nome atualizado)");
});

test("histórico de pedidos do cliente soma gasto e ignora pedidos cancelados", () => {
  const establishmentId = `store-${crypto.randomUUID()}`;
  const phone = "21944443333";
  createLocalDeliveryOrder(establishmentId, { customerName: "Cliente", customerPhone: phone, address: "Rua A, 1", deliveryFee: 5, items: [{ productId: "p1", productName: "X-Burger", quantity: 2, unitPrice: 20 }] });
  const cancelled = createLocalDeliveryOrder(establishmentId, { customerName: "Cliente", customerPhone: phone, address: "Rua B, 2", deliveryFee: 5, items: [{ productId: "p1", productName: "X-Burger", quantity: 1, unitPrice: 20 }] });
  changeLocalDeliveryStatus(establishmentId, cancelled.id, "CANCELLED");

  const stats = getLocalCustomerOrderStats(establishmentId, phone);
  assert.equal(stats.ordersCount, 1);
  assert.equal(stats.totalSpent, 45);
  assert.equal(stats.lastAddress, "Rua B, 2");
});
