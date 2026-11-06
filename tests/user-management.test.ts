import test from "node:test";
import assert from "node:assert/strict";
import { OWNER_PERMISSIONS } from "../lib/permissions.ts";
import { permissionLabels, moduleLabels } from "../lib/permission-presentation.ts";
import { createManagedUserSchema } from "../lib/user-management-validation.ts";

test("todas as permissões disponíveis possuem nomes de gestão em português", () => {
  for (const key of OWNER_PERMISSIONS) {
    assert.ok(permissionLabels[key], `Falta nome para ${key}`);
    assert.notEqual(permissionLabels[key], key);
    assert.ok(moduleLabels[key.split(".")[0]], `Falta área para ${key}`);
  }
});

test("novo usuário exige e-mail válido, perfil e unidade, sem aceitar confirmação pelo cliente", () => {
  const input = { name: "Pessoa Teste", username: "pessoa.teste", email: " Nome@EXAMPLE.COM ", establishmentIds: ["unit"], roleIds: ["role"] };
  assert.equal(createManagedUserSchema.parse(input).email, "nome@example.com");
  for (const invalid of [{ email: undefined }, { email: "inválido" }, { roleIds: [] }, { establishmentIds: [] }, { username: "nome com espaço" }]) {
    assert.equal(createManagedUserSchema.safeParse({ ...input, ...invalid }).success, false);
  }
  assert.equal("password" in createManagedUserSchema.parse({ ...input, password: "Admin123" }), false);
  assert.equal("emailVerifiedAt" in createManagedUserSchema.parse({ ...input, emailVerifiedAt: new Date() }), false);
});
