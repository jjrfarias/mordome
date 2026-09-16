import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_IMAGE_URL_MAX_LENGTH, productImageUrlSchema } from "../lib/catalog-validation.ts";
import { createLocalCatalogProduct, listLocalCatalog, updateLocalCatalogProduct } from "../lib/local-catalog.ts";

test("aceita uma data URL de imagem dentro do limite de tamanho", () => {
  const prefix = "data:image/jpeg;base64,";
  const value = prefix + "a".repeat(100);
  const result = productImageUrlSchema.safeParse(value);
  assert.ok(result.success);
});

test("rejeita string maior que o limite de tamanho, mesmo já comprimida no cliente", () => {
  const prefix = "data:image/jpeg;base64,";
  const value = prefix + "a".repeat(PRODUCT_IMAGE_URL_MAX_LENGTH);
  const result = productImageUrlSchema.safeParse(value);
  assert.equal(result.success, false);
});

test("rejeita valor que não é uma data URL de imagem", () => {
  const result = productImageUrlSchema.safeParse("https://exemplo.com/foto.jpg");
  assert.equal(result.success, false);
});

test("produto sem imageUrl continua sendo listado normalmente (sem quebrar serialização)", () => {
  const establishmentId = `no-image-${Date.now()}`;
  const product = createLocalCatalogProduct(establishmentId, { name: `Produto sem foto ${Date.now()}`, category: "Lanches", price: 10, channels: ["POS"] });
  assert.ok(product);
  assert.equal(product!.imageUrl, null);
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product!.id);
  assert.equal(catalog?.imageUrl, null);
});

test("produto com imageUrl é criado e servido corretamente no catálogo operacional", () => {
  const establishmentId = `with-image-${Date.now()}`;
  const imageUrl = "data:image/jpeg;base64,abc123";
  const product = createLocalCatalogProduct(establishmentId, { name: `Produto com foto ${Date.now()}`, category: "Lanches", price: 10, channels: ["POS"], imageUrl });
  assert.ok(product);
  assert.equal(product!.imageUrl, imageUrl);
  const catalog = listLocalCatalog(establishmentId).find(item => item.id === product!.id);
  assert.equal(catalog?.imageUrl, imageUrl);
});

test("atualizar oferta sem enviar imageUrl mantém a foto existente", () => {
  const establishmentId = `keep-image-${Date.now()}`;
  const imageUrl = "data:image/jpeg;base64,keepme";
  const product = createLocalCatalogProduct(establishmentId, { name: `Produto mantém foto ${Date.now()}`, category: "Lanches", price: 10, channels: ["POS"], imageUrl });
  assert.ok(product);
  const updated = updateLocalCatalogProduct(establishmentId, product!.id, { price: 12, channels: ["POS"] });
  assert.equal(updated?.imageUrl, imageUrl);
});

test("atualizar oferta enviando imageUrl null remove a foto existente", () => {
  const establishmentId = `remove-image-${Date.now()}`;
  const imageUrl = "data:image/jpeg;base64,removeme";
  const product = createLocalCatalogProduct(establishmentId, { name: `Produto remove foto ${Date.now()}`, category: "Lanches", price: 10, channels: ["POS"], imageUrl });
  assert.ok(product);
  const updated = updateLocalCatalogProduct(establishmentId, product!.id, { price: 12, channels: ["POS"], imageUrl: null });
  assert.equal(updated?.imageUrl, null);
});
