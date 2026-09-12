import assert from "node:assert/strict";
import test from "node:test";
import { addProduct, closeTable, initialState, products, recordPosSale, tableTotal } from "../lib/domain.ts";

test("abre a mesa e acumula produtos na comanda", () => {
  let table = initialState().tables[0];
  table = addProduct(table, products[0]);
  table = addProduct(table, products[0]);
  assert.equal(table.status, "Ocupada");
  assert.equal(table.items[0].quantity, 2);
  assert.equal(tableTotal(table), products[0].price * 2);
});

test("fechamento libera a mesa e registra venda no mesmo estabelecimento", () => {
  const original = initialState("tenant-a");
  const occupied = { ...original, tables: original.tables.map(table => table.id === 1 ? addProduct(table, products[1]) : table) };
  const result = closeTable(occupied, 1, "Pix");
  assert.equal(result.establishmentId, "tenant-a");
  assert.equal(result.tables[0].status, "Livre");
  assert.equal(result.tables[0].items.length, 0);
  assert.equal(result.sales.length, 1);
  assert.equal(result.sales[0].payment, "Pix");
});

test("não fecha uma comanda vazia", () => {
  const original = initialState();
  assert.deepEqual(closeTable(original, 1, "Dinheiro"), original);
});

test("PDV registra uma venda direta sem mesa", () => {
  const original = initialState("tenant-pdv");
  const result = recordPosSale(original, [{ ...products[0], quantity: 2 }], "Cartão de débito");
  assert.equal(result.sales.length, 1);
  assert.equal(result.sales[0].channel, "PDV");
  assert.equal(result.sales[0].table, undefined);
  assert.equal(result.sales[0].total, products[0].price * 2);
});
