import assert from "node:assert/strict";
import test from "node:test";
import { createTenantSchema, updateTenantStatusSchema } from "../lib/system-validation.ts";

test("criação de tenant exige proprietário e senha forte", () => {
  const valid = createTenantSchema.safeParse({ organizationName: "Restaurante Exemplo", establishmentName: "Unidade Centro", ownerName: "Maria Silva", ownerUsername: "maria.admin", ownerPassword: "SenhaSegura9!" });
  assert.equal(valid.success, true);
  const weakPassword = createTenantSchema.safeParse({ organizationName: "Restaurante Exemplo", establishmentName: "Unidade Centro", ownerName: "Maria Silva", ownerUsername: "maria.admin", ownerPassword: "curta" });
  assert.equal(weakPassword.success, false);
});

test("bloqueio ou liberação de tenant exige justificativa", () => {
  assert.equal(updateTenantStatusSchema.safeParse({ organizationId: "tenant-1", active: false, reason: "Inadimplência contratual" }).success, true);
  assert.equal(updateTenantStatusSchema.safeParse({ organizationId: "tenant-1", active: false, reason: "x" }).success, false);
});
