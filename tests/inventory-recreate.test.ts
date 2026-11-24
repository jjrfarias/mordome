import assert from "node:assert/strict";
import test from "node:test";
import { archiveLocalInventoryItem, createLocalInventoryItem, listLocalInventory } from "../lib/local-inventory.ts";

test("recadastro reativa o item arquivado e preserva sua identidade", () => {
  const establishmentId = `recreate-${crypto.randomUUID()}`;
  const input = { name: `Coca-Cola Lata ${crypto.randomUUID()}`, baseUnit: "UNIT" as const, trackingMode: "AUTOMATIC" as const, minimumStock: 0, allowNegative: true };
  const original = createLocalInventoryItem(establishmentId, input);
  assert.ok(original);
  assert.equal(archiveLocalInventoryItem(establishmentId, original.id), "ARCHIVED");
  assert.equal(listLocalInventory(establishmentId).some(item => item.id === original.id), false);
  const recreated = createLocalInventoryItem(establishmentId, { ...input, minimumStock: 5 });
  assert.equal(recreated?.id, original.id);
  assert.equal(recreated?.establishmentItemId, original.establishmentItemId);
  assert.equal(recreated?.minimumStock, 5);
  assert.equal(createLocalInventoryItem(establishmentId, input), null);
});
