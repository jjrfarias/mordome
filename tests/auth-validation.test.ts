import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../lib/auth-validation.ts";

test("slugify normaliza acentos em identificadores estaveis", () => {
  assert.equal(slugify("Porções"), "porcoes");
  assert.equal(slugify("Hot Dog Especial Betão"), "hot-dog-especial-betao");
  assert.equal(slugify("Água Mineral"), "agua-mineral");
});
