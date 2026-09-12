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

test("gestão de estabelecimentos exige permissão explícita", () => {
  assert.equal(hasPermission(context, "establishments.manage"), false);
  const ownerContext = { ...context, rolePermissions: new Set([...context.rolePermissions, "establishments.manage"]) };
  assert.equal(hasPermission(ownerContext, "establishments.manage"), true);
});

test("gestão do cardápio exige permissão explícita", () => {
  assert.equal(hasPermission(context, "catalog.manage"), false);
  const ownerContext = { ...context, rolePermissions: new Set([...context.rolePermissions, "catalog.manage"]) };
  assert.equal(hasPermission(ownerContext, "catalog.manage"), true);
});

test("gestão do estoque exige permissão explícita", () => {
  assert.equal(hasPermission(context, "stock.manage"), false);
  const stockContext = { ...context, rolePermissions: new Set([...context.rolePermissions, "stock.manage"]) };
  assert.equal(hasPermission(stockContext, "stock.manage"), true);
});

test("gestão de fichas técnicas exige permissão explícita", () => {
  assert.equal(hasPermission(context, "recipes.manage"), false);
  const recipeContext = { ...context, rolePermissions: new Set([...context.rolePermissions, "recipes.manage"]) };
  assert.equal(hasPermission(recipeContext, "recipes.manage"), true);
});

test("histórico completo exige permissão explícita", () => {
  assert.equal(hasPermission(context, "audit.view"), false);
  const auditContext = { ...context, rolePermissions: new Set([...context.rolePermissions, "audit.view"]) };
  assert.equal(hasPermission(auditContext, "audit.view"), true);
});

test("administração de equipe usa permissões independentes", () => {
  assert.equal(hasPermission(context, "users.view"), false);
  const teamContext = { ...context, rolePermissions: new Set([...context.rolePermissions, "users.view", "users.invite"]) };
  assert.equal(hasPermission(teamContext, "users.view"), true);
  assert.equal(hasPermission(teamContext, "users.invite"), true);
  assert.equal(hasPermission(teamContext, "users.disable"), false);
  assert.equal(hasPermission(teamContext, "roles.manage"), false);
});

test("cancelar é independente de vender e operar o salão", () => {
  assert.equal(hasPermission(context, "pos.sell"), true);
  assert.equal(hasPermission(context, "pos.cancel_sale"), false);
  assert.equal(hasPermission(context, "tabs.cancel_item"), false);
  const managerContext = { ...context, rolePermissions: new Set([...context.rolePermissions, "pos.cancel_sale", "tabs.cancel_item"]) };
  assert.equal(hasPermission(managerContext, "pos.cancel_sale"), true);
  assert.equal(hasPermission(managerContext, "tabs.cancel_item"), true);
});

test("reimpressão exige permissão própria", () => {
  assert.equal(hasPermission(context, "print.reprint"), false);
  const printContext = { ...context, rolePermissions: new Set([...context.rolePermissions, "print.reprint"]) };
  assert.equal(hasPermission(printContext, "print.reprint"), true);
});
