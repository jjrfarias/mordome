import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../lib/password.ts";

test("gera hashes diferentes para a mesma senha e valida a senha correta", async () => {
  const first = await hashPassword("Mordome123");
  const second = await hashPassword("Mordome123");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("Mordome123", first), true);
  assert.equal(await verifyPassword("outra-senha", first), false);
});

test("rejeita hash inválido", async () => {
  assert.equal(await verifyPassword("Mordome123", "invalido"), false);
});
