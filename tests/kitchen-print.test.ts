import { test } from "node:test";
import assert from "node:assert/strict";
import { kitchenEscpos, printerText, printTokenHash, selectedOptionNames } from "../lib/kitchen-print.ts";

test("catalog text cannot inject ESC/POS control bytes", () => {
  assert.equal(printerText("Açaí\x1b@\n\x1dV"), "Acai @  V");
});
test("kitchen ticket preserves quantity, options and includes a single cut", () => {
  const bytes = Buffer.from(kitchenEscpos({ establishment: "Liberdade", label: "Mesa 5", orderId: "order-123", sentAt: new Date("2026-11-07T18:00:00Z"), items: [{ name: "Pastel - sem cebola", quantity: 2 }] }), "base64");
  assert.ok(bytes.includes(Buffer.from("2x Pastel - sem cebola")));
  assert.ok(bytes.includes(Buffer.from("Mesa 5")));
  assert.ok(bytes.includes(Buffer.from([27, 69, 1, 27, 71, 1])));
  assert.ok(bytes.includes(Buffer.from([27, 69, 0, 27, 71, 0])));
  assert.deepEqual([...bytes.subarray(-3)], [29, 86, 1]);
  assert.equal(bytes.filter(byte => byte === 86).length, 1);
});
test("reinforced kitchen item wraps within 42 thermal columns", () => {
  const bytes = Buffer.from(kitchenEscpos({ establishment: "Liberdade", label: "Mesa 5", orderId: "order-124", sentAt: new Date("2026-11-07T18:00:00Z"), items: [{ name: "Pastel de frango com catupiry e observacao sem cebola", quantity: 12 }] }), "base64");
  const text = bytes.toString("ascii");
  const itemLines = text.slice(text.indexOf("12x "), text.indexOf("------------------------------------------", text.indexOf("12x "))).trim().split("\n");
  assert.ok(itemLines.length > 1);
  assert.ok(itemLines.every(line => line.length <= 42));
});
test("tokens are hashed and option snapshots tolerate malformed data", () => {
  assert.equal(printTokenHash("secret").length, 64);
  assert.notEqual(printTokenHash("secret"), printTokenHash("other"));
  assert.deepEqual(selectedOptionNames(null), []);
  assert.deepEqual(selectedOptionNames([{ optionName: "Queijo" }, {}, null]), ["Queijo"]);
});
