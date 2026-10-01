import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { customerPhone, customerCookie, identityHash, codeMatches, newCustomerCode } from "../lib/customer-identity.ts";

test("Customer phone normalizes Brazilian mobiles and rejects incomplete numbers", () => {
  assert.equal(customerPhone("(22) 99999-0000"), "5522999990000");
  assert.equal(customerPhone("+55 22 99999-0000"), "5522999990000");
  assert.equal(customerPhone("22 3333-0000"), null);
  assert.equal(customerPhone("123"), null);
});
test("Code hash is scoped to challenge and unit; cookies are separate from employee login", () => {
  process.env.CUSTOMER_AUTH_SECRET = randomBytes(32).toString("hex");
  const code = newCustomerCode(); assert.match(code, /^\d{6}$/);
  const hash = identityHash(`a:challenge:${code}`);
  assert.equal(codeMatches("a", "challenge", code, hash), true);
  assert.equal(codeMatches("b", "challenge", code, hash), false);
  assert.equal(codeMatches("a", "another", code, hash), false);
  assert.notEqual(customerCookie("a"), customerCookie("b"));
  assert.notEqual(customerCookie("a"), "mordome_session");
});
