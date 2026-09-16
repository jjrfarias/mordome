import assert from "node:assert/strict";
import test from "node:test";
import { createLocalCancellationReason, listLocalCancellationReasons, updateLocalCancellationReason } from "../lib/local-cancellation-reasons.ts";

test("Motivos de cancelamento: criação com nome duplicado na mesma categoria é rejeitada", () => {
  const organizationId = `reason-dup-${Date.now()}`;
  const created = createLocalCancellationReason(organizationId, { category: "SALE_CANCEL", label: "Pedido errado" });
  assert.notEqual(created, "DUPLICATE");
  const duplicate = createLocalCancellationReason(organizationId, { category: "SALE_CANCEL", label: "pedido errado" });
  assert.equal(duplicate, "DUPLICATE");
});

test("Motivos de cancelamento: mesmo texto em categoria diferente não é duplicado", () => {
  const organizationId = `reason-diff-category-${Date.now()}`;
  const first = createLocalCancellationReason(organizationId, { category: "SALE_CANCEL", label: "Cliente desistiu" });
  assert.notEqual(first, "DUPLICATE");
  const second = createLocalCancellationReason(organizationId, { category: "REFUND", label: "Cliente desistiu" });
  assert.notEqual(second, "DUPLICATE");
});

test("Motivos de cancelamento: inativação não exclui o motivo (mesmo padrão dos demais cadastros)", () => {
  const organizationId = `reason-inactivate-${Date.now()}`;
  const reason = createLocalCancellationReason(organizationId, { category: "ITEM_CANCEL", label: "Item fora do cardápio" });
  assert.notEqual(reason, "DUPLICATE"); if (reason === "DUPLICATE") return;
  const updated = updateLocalCancellationReason(organizationId, reason.id, { active: false });
  assert.notEqual(updated, "NOT_FOUND"); assert.notEqual(updated, "DUPLICATE"); if (typeof updated === "string") return;
  assert.equal(updated.active, false);
  const listed = listLocalCancellationReasons(organizationId).find(candidate => candidate.id === reason.id);
  assert.ok(listed);
  assert.equal(listed?.active, false);
});

test("Isolamento: motivos de uma organização não aparecem para outra", () => {
  const organizationId = `reason-iso-a-${Date.now()}`;
  const otherOrganizationId = `reason-iso-b-${Date.now()}`;
  createLocalCancellationReason(organizationId, { category: "REFUND", label: "Produto com defeito" });
  assert.equal(listLocalCancellationReasons(otherOrganizationId).length, 0);
  assert.equal(listLocalCancellationReasons(organizationId).length, 1);
});

test("Isolamento por categoria: motivo de uma categoria não aparece nas outras", () => {
  const organizationId = `reason-category-iso-${Date.now()}`;
  createLocalCancellationReason(organizationId, { category: "SALE_CANCEL", label: "Motivo de venda" });
  createLocalCancellationReason(organizationId, { category: "REFUND", label: "Motivo de reembolso" });
  const saleReasons = listLocalCancellationReasons(organizationId, "SALE_CANCEL");
  const refundReasons = listLocalCancellationReasons(organizationId, "REFUND");
  const itemReasons = listLocalCancellationReasons(organizationId, "ITEM_CANCEL");
  assert.equal(saleReasons.length, 1);
  assert.equal(refundReasons.length, 1);
  assert.equal(itemReasons.length, 0);
  assert.equal(saleReasons[0].label, "Motivo de venda");
});
