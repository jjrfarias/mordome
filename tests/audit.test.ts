import assert from "node:assert/strict";
import test from "node:test";
import { redactAuditValue } from "../lib/audit.ts";
import { listLocalAudit, recordLocalAudit } from "../lib/local-audit.ts";

test("histórico local isola organizações e filtra unidade, ação e texto", () => {
  const suffix = Date.now().toString();
  const organizationId = `audit-org-${suffix}`;
  const base = { organizationId, actorId: "user-1", actorName: "Maria Silva", actorUsername: "maria", entityType: "Sale" };
  recordLocalAudit({ ...base, establishmentId: "unit-a", establishmentName: "Unidade A", action: "SALE_COMPLETE", entityId: "sale-1", reason: "Venda do balcão" });
  recordLocalAudit({ ...base, establishmentId: "unit-b", establishmentName: "Unidade B", action: "SALE_CANCEL", entityId: "sale-2", reason: "Cancelada pelo gerente" });
  recordLocalAudit({ ...base, organizationId: `other-${suffix}`, establishmentId: "unit-a", action: "SALE_COMPLETE", entityId: "sale-3" });

  assert.equal(listLocalAudit({ organizationId, limit: 30 }).length, 2);
  assert.equal(listLocalAudit({ organizationId, establishmentId: "unit-a", limit: 30 })[0]?.entityId, "sale-1");
  assert.equal(listLocalAudit({ organizationId, action: "SALE_CANCEL", limit: 30 })[0]?.entityId, "sale-2");
  assert.equal(listLocalAudit({ organizationId, query: "Maria", limit: 30 }).length, 2);
  assert.equal(listLocalAudit({ organizationId, query: "gerente", limit: 30 })[0]?.entityId, "sale-2");
});

test("dados sensíveis são removidos antes de exibir antes e depois", () => {
  const redacted = redactAuditValue({ username: "operador", password: "segredo", nested: { sessionToken: "token", amount: 25 }, rows: [{ authorization: "bearer", product: "X" }] });
  assert.deepEqual(redacted, { username: "operador", password: "[PROTEGIDO]", nested: { sessionToken: "[PROTEGIDO]", amount: 25 }, rows: [{ authorization: "[PROTEGIDO]", product: "X" }] });
});
