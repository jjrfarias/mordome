import assert from "node:assert/strict";
import test from "node:test";
import { createLocalCatalogProduct, listLocalCatalog, updateLocalCatalogProduct } from "../lib/local-catalog.ts";

test("descrição do catálogo é publicada, preservada quando omitida e pode ser removida", () => {
  const establishmentId = "description-test";
  const product = createLocalCatalogProduct(establishmentId, { name: "Produto descrição teste", category: "Teste", description: "  Ingredientes da casa  ", price: 10, channels: ["DELIVERY"] });
  assert.ok(product);
  assert.equal(listLocalCatalog(establishmentId).find(item => item.id === product.id)?.description, "Ingredientes da casa");
  const preserved = updateLocalCatalogProduct(establishmentId, product.id, { price: 12, channels: ["DELIVERY"] });
  assert.equal(preserved?.description, "Ingredientes da casa");
  const cleared = updateLocalCatalogProduct(establishmentId, product.id, { price: 12, channels: ["DELIVERY"], description: " " });
  assert.equal(cleared?.description, null);
});
