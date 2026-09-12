import assert from "node:assert/strict";
import test from "node:test";
import { authorize, hasPermission, type PermissionContext } from "../lib/authorization.ts";

const context: PermissionContext = {
  organizationId: "org-a",
  allowedEstablishmentIds: new Set(["store-a"]),
  rolePermissions: new Set(["pos.sell", "floor.view", "finance.summary.view"]),
  overrides: new Map([["finance.summary.view", "DENY"], ["finance.reports.view", "ALLOW"]]),
};

test("nega acesso cruzado entre organizações e unidades", () => {
  assert.equal(authorize(context, { organizationId: "org-b", establishmentId: "store-a", permission: "pos.sell" }), false);
  assert.equal(authorize(context, { organizationId: "org-a", establishmentId: "store-b", permission: "pos.sell" }), false);
});

test("bloqueio individual prevalece sobre o perfil", () => {
  assert.equal(hasPermission(context, "finance.summary.view"), false);
});

test("concessão individual adiciona acesso específico", () => {
  assert.equal(authorize(context, { organizationId: "org-a", establishmentId: "store-a", permission: "finance.reports.view" }), true);
});
