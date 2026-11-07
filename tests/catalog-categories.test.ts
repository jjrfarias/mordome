import assert from "node:assert/strict";
import test from "node:test";
import { createLocalCategory, createLocalCatalogProduct, listLocalCategories, updateLocalCatalogProduct } from "../lib/local-catalog.ts";

test("categorias podem existir sem produtos e ser escolhidas para cadastro e edição", () => {
  const category = createLocalCategory("Categoria avulsa QA");
  assert.ok(category);
  assert.equal(listLocalCategories().find(item => item.id === category.id)?.productCount, 0);
  assert.equal(createLocalCategory(" categoria AVULSA qa "), null);
  const other = createLocalCategory("Outra categoria QA");
  assert.ok(other);
  const product = createLocalCatalogProduct("categories-test", { name: "Produto categorias QA", category: category.name, price: 22, channels: ["POS"] });
  assert.ok(product);
  assert.equal(listLocalCategories().find(item => item.id === category.id)?.productCount, 1);
  const edited = updateLocalCatalogProduct("categories-test", product.id, { category: other.name, price: 22, channels: ["POS"] });
  assert.equal(edited?.category, other.name);
  assert.equal(listLocalCategories().find(item => item.id === category.id)?.productCount, 0);
});
