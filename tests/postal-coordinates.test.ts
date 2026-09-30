import assert from "node:assert/strict";
import test from "node:test";
import { postalCoordinate } from "../lib/postal-coordinates.ts";

test("CEP não transforma coordenadas ausentes ou inválidas em zero", () => {
  for (const value of [undefined, null, "", "  ", "inválido", Infinity, {}, true, 91, -91]) {
    assert.equal(postalCoordinate(value, 90), null);
  }
});

test("CEP aceita coordenadas válidas e respeita limites geográficos", () => {
  assert.equal(postalCoordinate("-22.37", 90), -22.37);
  assert.equal(postalCoordinate(0, 90), 0);
  assert.equal(postalCoordinate("180", 180), 180);
  assert.equal(postalCoordinate(-180.1, 180), null);
});
