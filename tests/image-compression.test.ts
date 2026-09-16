import assert from "node:assert/strict";
import test from "node:test";
import { calculateResizedDimensions, MAX_PRODUCT_IMAGE_DIMENSION } from "../lib/image-compression.ts";

test("mantém a proporção ao redimensionar uma imagem larga", () => {
  const result = calculateResizedDimensions(1600, 800);
  assert.equal(result.width, MAX_PRODUCT_IMAGE_DIMENSION);
  assert.equal(result.height, 400);
});

test("mantém a proporção ao redimensionar uma imagem alta", () => {
  const result = calculateResizedDimensions(600, 1200);
  assert.equal(result.height, MAX_PRODUCT_IMAGE_DIMENSION);
  assert.equal(result.width, 400);
});

test("não amplia uma imagem menor que o máximo", () => {
  const result = calculateResizedDimensions(300, 200);
  assert.deepEqual(result, { width: 300, height: 200 });
});

test("respeita exatamente o limite quando o maior lado já é o máximo", () => {
  const result = calculateResizedDimensions(MAX_PRODUCT_IMAGE_DIMENSION, MAX_PRODUCT_IMAGE_DIMENSION);
  assert.deepEqual(result, { width: MAX_PRODUCT_IMAGE_DIMENSION, height: MAX_PRODUCT_IMAGE_DIMENSION });
});

test("imagem quadrada grande é reduzida para o máximo nos dois lados", () => {
  const result = calculateResizedDimensions(2000, 2000);
  assert.deepEqual(result, { width: MAX_PRODUCT_IMAGE_DIMENSION, height: MAX_PRODUCT_IMAGE_DIMENSION });
});

test("dimensões inválidas retornam zero em vez de quebrar", () => {
  assert.deepEqual(calculateResizedDimensions(0, 500), { width: 0, height: 0 });
  assert.deepEqual(calculateResizedDimensions(500, 0), { width: 0, height: 0 });
});
