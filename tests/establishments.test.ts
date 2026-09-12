import assert from "node:assert/strict";
import test from "node:test";
import { canDeactivateEstablishment } from "../lib/permissions.ts";

test("impede desativar a unidade ativa", () => {
  const result = canDeactivateEstablishment({
    establishmentId: "store-a",
    activeEstablishmentId: "store-a",
    activeEstablishmentCount: 3,
  });
  assert.equal(result.allowed, false);
});

test("impede desativar a última unidade ativa", () => {
  const result = canDeactivateEstablishment({
    establishmentId: "store-a",
    activeEstablishmentId: "store-b",
    activeEstablishmentCount: 1,
  });
  assert.equal(result.allowed, false);
});

test("permite desativar outra unidade quando existe alternativa ativa", () => {
  const result = canDeactivateEstablishment({
    establishmentId: "store-a",
    activeEstablishmentId: "store-b",
    activeEstablishmentCount: 2,
  });
  assert.equal(result.allowed, true);
});
