import assert from "node:assert/strict";
import test from "node:test";
import { addLocalStockEntry, applyLocalBulkPhysicalCount, configureLocalInventoryItem, createLocalInventoryItem } from "../lib/local-inventory.ts";
import { resolvePhysicalCountAdjustment } from "../lib/inventory-domain.ts";

function setupItem(establishmentId: string, name: string, initialQuantity: number, allowNegative = true) {
  const item = createLocalInventoryItem(establishmentId, { name, baseUnit: "GRAM", trackingMode: "MANUAL", minimumStock: 0, allowNegative });
  assert.ok(item?.establishmentItemId);
  if (initialQuantity > 0) addLocalStockEntry(establishmentId, item.establishmentItemId!, initialQuantity, 1);
  return item.establishmentItemId!;
}

test("aplica contagem em lote calculando o delta correto por item", () => {
  const suffix = `${Date.now()}-lote`;
  const establishmentId = `unidade-${suffix}`;
  const paoId = setupItem(establishmentId, `Pão ${suffix}`, 100);
  const salsichaId = setupItem(establishmentId, `Salsicha ${suffix}`, 50);

  const result = applyLocalBulkPhysicalCount(establishmentId, [
    { establishmentItemId: paoId, countedQuantity: 110, factorToBase: 1 },
    { establishmentItemId: salsichaId, countedQuantity: 45, factorToBase: 1 },
  ], `bulk-${suffix}`);

  assert.ok(Array.isArray(result));
  if (!Array.isArray(result)) return;
  assert.equal(result.length, 2);
  const pao = result.find(entry => entry.establishmentItemId === paoId);
  const salsicha = result.find(entry => entry.establishmentItemId === salsichaId);
  assert.equal(pao?.delta, 10);
  assert.equal(pao?.balance, 110);
  assert.equal(salsicha?.delta, -5);
  assert.equal(salsicha?.balance, 45);
});

test("itens sem contagem preenchida não são tocados (não fazem parte do payload)", () => {
  const suffix = `${Date.now()}-nao-tocado`;
  const establishmentId = `unidade-${suffix}`;
  const paoId = setupItem(establishmentId, `Pão ${suffix}`, 100);
  setupItem(establishmentId, `Molho ${suffix}`, 30);

  const result = applyLocalBulkPhysicalCount(establishmentId, [
    { establishmentItemId: paoId, countedQuantity: 100, factorToBase: 1 },
  ], `bulk-${suffix}`);

  assert.ok(Array.isArray(result));
});

test("itens com contagem igual ao saldo não geram movimento", () => {
  const suffix = `${Date.now()}-igual`;
  const establishmentId = `unidade-${suffix}`;
  const paoId = setupItem(establishmentId, `Pão ${suffix}`, 100);

  const result = applyLocalBulkPhysicalCount(establishmentId, [
    { establishmentItemId: paoId, countedQuantity: 100, factorToBase: 1 },
  ], `bulk-${suffix}`);

  assert.ok(Array.isArray(result));
  if (!Array.isArray(result)) return;
  assert.equal(result.length, 0);
});

test("falha em um item não aplica nenhum ajuste da sessão (atomicidade)", () => {
  const suffix = `${Date.now()}-atomico`;
  const establishmentId = `unidade-${suffix}`;
  const paoId = setupItem(establishmentId, `Pão ${suffix}`, 100);

  const result = applyLocalBulkPhysicalCount(establishmentId, [
    { establishmentItemId: paoId, countedQuantity: 200, factorToBase: 1 },
    { establishmentItemId: `nao-existe-${suffix}`, countedQuantity: 0, factorToBase: 1 },
  ], `bulk-${suffix}`);

  assert.ok(typeof result === "object" && result !== null && "failedEstablishmentItemId" in result);

  const followUp = applyLocalBulkPhysicalCount(establishmentId, [
    { establishmentItemId: paoId, countedQuantity: 999, factorToBase: 1 },
  ], `bulk-${suffix}-check`);
  assert.ok(Array.isArray(followUp));
  if (!Array.isArray(followUp)) return;
  const paoEntry = followUp.find(entry => entry.establishmentItemId === paoId);
  assert.equal(paoEntry?.balance, 999);
  assert.equal(paoEntry?.delta, 899);
});

test("não repete uma contagem em lote com a mesma chave de idempotência", () => {
  const suffix = `${Date.now()}-idem`;
  const establishmentId = `unidade-${suffix}`;
  const paoId = setupItem(establishmentId, `Pão ${suffix}`, 100);
  const input = [{ establishmentItemId: paoId, countedQuantity: 120, factorToBase: 1 }];
  const first = applyLocalBulkPhysicalCount(establishmentId, input, `bulk-${suffix}`);
  assert.ok(Array.isArray(first));
  const second = applyLocalBulkPhysicalCount(establishmentId, input, `bulk-${suffix}`);
  assert.equal(second, "DUPLICATE");
});

test("isola a contagem por estabelecimento", () => {
  const suffix = `${Date.now()}-isolamento`;
  const establishmentA = `unidade-a-${suffix}`;
  const establishmentB = `unidade-b-${suffix}`;
  const item = createLocalInventoryItem(establishmentA, { name: `Item ${suffix}`, baseUnit: "GRAM", trackingMode: "MANUAL", minimumStock: 0, allowNegative: true });
  assert.ok(item?.establishmentItemId);
  addLocalStockEntry(establishmentA, item!.establishmentItemId!, 100, 1);
  configureLocalInventoryItem(establishmentB, item!.id);

  const result = applyLocalBulkPhysicalCount(establishmentB, [
    { establishmentItemId: item!.establishmentItemId!, countedQuantity: 50, factorToBase: 1 },
  ], `bulk-${suffix}`);
  // establishmentItemId pertence à unidade A, não deve ser encontrado usando a config de B
  assert.ok(typeof result === "object" && result !== null && "failedEstablishmentItemId" in result);
});

test("a regra de cálculo do delta é a mesma usada pelo ajuste individual", () => {
  const outcome = resolvePhysicalCountAdjustment({ countedQuantity: 30, factorToBase: 1000, balance: 25000, allowNegative: true });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.delta, 5000);
  assert.equal(outcome.newBalance, 30000);
});
