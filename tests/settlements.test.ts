import assert from "node:assert/strict";
import test from "node:test";
import { calculateCommission } from "../lib/settlements.ts";
import {
  createLocalCommissionRule,
  computeLocalSettlementCandidates,
  createLocalSettlementRecord,
  listLocalSettlementRecords,
} from "../lib/local-settlements.ts";
import { createLocalDeliveryOrder, changeLocalDeliveryStatus, assignLocalCourier } from "../lib/local-delivery.ts";
import { completeLocalSale, settleLocalSale } from "../lib/local-sales.ts";

test("calculateCommission: fixo por entrega", () => {
  const amount = calculateCommission({ amountPerDelivery: 5, percentOfSales: null }, { deliveryCount: 4, salesTotal: 0 });
  assert.equal(amount, 20);
});

test("calculateCommission: percentual sobre vendas", () => {
  const amount = calculateCommission({ amountPerDelivery: null, percentOfSales: 10 }, { deliveryCount: 0, salesTotal: 250 });
  assert.equal(amount, 25);
});

test("calculateCommission: sem regra retorna zero", () => {
  assert.equal(calculateCommission(null, { deliveryCount: 3, salesTotal: 100 }), 0);
});

function deliverOrder(establishmentId: string, courierId: string) {
  const order = createLocalDeliveryOrder(establishmentId, { customerName: "Cliente", customerPhone: "119999", address: "Rua X", items: [{ productId: "p1", productName: "Hot dog", quantity: 1, unitPrice: 10 }] });
  assignLocalCourier(establishmentId, order.id, courierId);
  changeLocalDeliveryStatus(establishmentId, order.id, "PREPARING");
  changeLocalDeliveryStatus(establishmentId, order.id, "OUT_FOR_DELIVERY");
  changeLocalDeliveryStatus(establishmentId, order.id, "DELIVERED");
  return order;
}

test("acerto de entregador: soma entregas concluídas e aplica regra fixa por entrega", () => {
  const establishmentId = `store-${crypto.randomUUID()}`;
  const courierId = `user-${crypto.randomUUID()}`;
  deliverOrder(establishmentId, courierId);
  deliverOrder(establishmentId, courierId);

  createLocalCommissionRule(establishmentId, { userId: courierId, role: "COURIER", amountPerDelivery: 5, percentOfSales: null });

  const from = new Date(Date.now() - 60_000).toISOString();
  const to = new Date(Date.now() + 60_000).toISOString();
  const candidates = computeLocalSettlementCandidates(establishmentId, "COURIER", from, to);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].deliveryCount, 2);
  assert.equal(candidates[0].amount, 10);
  assert.equal(candidates[0].hasRule, true);
});

test("acerto de entregador sem regra configurada aparece com valor zero", () => {
  const establishmentId = `store-${crypto.randomUUID()}`;
  const courierId = `user-${crypto.randomUUID()}`;
  deliverOrder(establishmentId, courierId);

  const from = new Date(Date.now() - 60_000).toISOString();
  const to = new Date(Date.now() + 60_000).toISOString();
  const candidates = computeLocalSettlementCandidates(establishmentId, "COURIER", from, to);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].amount, 0);
  assert.equal(candidates[0].hasRule, false);
});

test("acerto de garçom: soma vendas de salão concluídas e aplica percentual", () => {
  const establishmentId = `store-${crypto.randomUUID()}`;
  const waiterId = `user-${crypto.randomUUID()}`;

  const sale1 = completeLocalSale({ establishmentId, idempotencyKey: crypto.randomUUID(), channel: "FLOOR", items: [], operatorId: waiterId });
  if (sale1.status === "COMPLETED") settleLocalSale(sale1.sale.id, { cashSessionId: "cash-1", method: "CASH", amount: 100 });
  const sale2 = completeLocalSale({ establishmentId, idempotencyKey: crypto.randomUUID(), channel: "FLOOR", items: [], operatorId: waiterId });
  if (sale2.status === "COMPLETED") settleLocalSale(sale2.sale.id, { cashSessionId: "cash-1", method: "CASH", amount: 50 });

  createLocalCommissionRule(establishmentId, { userId: waiterId, role: "WAITER", amountPerDelivery: null, percentOfSales: 10 });

  const from = new Date(Date.now() - 60_000).toISOString();
  const to = new Date(Date.now() + 60_000).toISOString();
  const candidates = computeLocalSettlementCandidates(establishmentId, "WAITER", from, to);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].salesTotal, 150);
  assert.equal(candidates[0].amount, 15);
});

test("bloqueia acerto duplicado para o mesmo usuário/papel/período exato", () => {
  const establishmentId = `store-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const createdById = `admin-${crypto.randomUUID()}`;
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-15T23:59:59.999Z";

  const first = createLocalSettlementRecord(establishmentId, { userId, role: "COURIER", from, to, amount: 50, createdById });
  assert.notEqual(first, "DUPLICATE");

  const duplicate = createLocalSettlementRecord(establishmentId, { userId, role: "COURIER", from, to, amount: 50, createdById });
  assert.equal(duplicate, "DUPLICATE");

  // Período diferente para o mesmo usuário/papel não é bloqueado (comparação exata, ver ADR 0018)
  const differentPeriod = createLocalSettlementRecord(establishmentId, { userId, role: "COURIER", from: "2026-09-16T00:00:00.000Z", to: "2026-09-30T23:59:59.999Z", amount: 60, createdById });
  assert.notEqual(differentPeriod, "DUPLICATE");

  assert.equal(listLocalSettlementRecords(establishmentId, "COURIER").length, 2);
});

test("acertos e candidatos não vazam entre estabelecimentos", () => {
  const establishmentA = `store-a-${crypto.randomUUID()}`;
  const establishmentB = `store-b-${crypto.randomUUID()}`;
  const courierId = `user-${crypto.randomUUID()}`;
  deliverOrder(establishmentA, courierId);

  const from = new Date(Date.now() - 60_000).toISOString();
  const to = new Date(Date.now() + 60_000).toISOString();
  assert.equal(computeLocalSettlementCandidates(establishmentA, "COURIER", from, to).length, 1);
  assert.equal(computeLocalSettlementCandidates(establishmentB, "COURIER", from, to).length, 0);
});
