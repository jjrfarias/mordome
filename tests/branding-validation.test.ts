import assert from "node:assert/strict";
import test from "node:test";
import { tenantBrandingSchema } from "../lib/branding-validation.ts";

test("identidade do tenant aceita logo e cores hexadecimais", () => {
  assert.equal(tenantBrandingSchema.safeParse({ logoUrl: "data:image/png;base64,AA==", primary: "#173f35", accent: "#e97c4b" }).success, true);
});

test("identidade do tenant rejeita URL externa e cor inválida", () => {
  assert.equal(tenantBrandingSchema.safeParse({ logoUrl: "https://example.com/logo.png", primary: "red", accent: "#e97c4b" }).success, false);
});
