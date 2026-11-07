import assert from "node:assert/strict";
import test from "node:test";
import { archiveLocalCatalogProduct, createLocalCatalogProduct, listLocalCatalog, updateLocalCatalogProduct } from "../lib/local-catalog.ts";
import type { LocalCatalogProduct } from "../lib/local-catalog.ts";

test("renomear mantém identidade e ofertas; excluir retira todos os canais sem apagar o registro", () => {
  const product = createLocalCatalogProduct("lifecycle-a", { name: "Pastel ciclo inicial", category: "Pastéis", price: 22, channels: ["POS", "DELIVERY"], description: "Receita preservada" });
  assert.ok(product);
  const renamed = updateLocalCatalogProduct("lifecycle-a", product.id, { name: "Pastel ciclo renomeado", price: 22, channels: ["POS", "DELIVERY"] });
  assert.equal(renamed?.id, product.id);
  assert.equal(renamed?.name, "Pastel ciclo renomeado");
  assert.equal(renamed?.description, "Receita preservada");
  updateLocalCatalogProduct("lifecycle-b", product.id, { price: 25, channels: ["ONLINE"] });
  assert.ok(archiveLocalCatalogProduct(product.id));
  for (const unit of ["lifecycle-a", "lifecycle-b"]) {
    const archived: LocalCatalogProduct | undefined = listLocalCatalog(unit).find(item => item.id === product.id);
    assert.ok(archived);
    assert.equal(archived.active, false);
    assert.deepEqual(archived.channels, []);
  }
  assert.equal(updateLocalCatalogProduct("lifecycle-a", product.id, { price: 22, channels: ["POS"] }), null);
  assert.equal(archiveLocalCatalogProduct(product.id), null);
});
