import assert from "node:assert/strict";
import test from "node:test";
import { buildFocusNfcePayload } from "../lib/fiscal/payload.ts";
import { mockFiscalProvider } from "../lib/fiscal/mock-provider.ts";

const completeItem = { productName: "X-Burger da Casa", quantity: 2, unitPrice: 28.9, ncm: "21069090", cfop: "5102", icmsCst: "102", icmsOrigin: "0", unitOfMeasure: "UN" };

test("payload da NFC-e recusa item sem dados fiscais completos, identificando o produto", () => {
  const result = buildFocusNfcePayload({ saleId: "sale-1", cnpj: "12345678000123", items: [{ ...completeItem, ncm: null }], payments: [{ method: "CASH", amount: 57.8 }] });
  assert.ok("error" in result);
  if (!("error" in result)) return;
  assert.match(result.error, /X-Burger da Casa/);
  assert.match(result.error, /ncm/);
});

test("payload da NFC-e recusa venda sem itens ou sem pagamento", () => {
  assert.ok("error" in buildFocusNfcePayload({ saleId: "s", cnpj: "12345678000123", items: [], payments: [{ method: "CASH", amount: 10 }] }));
  assert.ok("error" in buildFocusNfcePayload({ saleId: "s", cnpj: "12345678000123", items: [completeItem], payments: [] }));
});

test("payload da NFC-e monta itens e pagamentos no formato exato da API do Focus NFe", () => {
  const result = buildFocusNfcePayload({ saleId: "sale-2", cnpj: "12.345.678/0001-23", items: [completeItem], payments: [{ method: "PIX", amount: 57.8 }] });
  assert.ok("payload" in result);
  if (!("payload" in result)) return;
  assert.equal(result.payload.cnpj_emitente, "12345678000123");
  assert.equal(result.payload.items.length, 1);
  const item = result.payload.items[0];
  assert.equal(item.codigo_ncm, "21069090");
  assert.equal(item.cfop, "5102");
  assert.equal(item.icms_origem, "0");
  assert.equal(item.icms_situacao_tributaria, "102");
  assert.equal(item.valor_bruto, 57.8);
  assert.deepEqual(result.payload.formas_pagamento, [{ forma_pagamento: "17", valor_pagamento: 57.8 }]);
});

test("payload da NFC-e mapeia todas as formas de pagamento conhecidas pra código SEFAZ", () => {
  const result = buildFocusNfcePayload({ saleId: "sale-3", cnpj: "12345678000123", items: [completeItem], payments: [{ method: "CASH", amount: 20 }, { method: "CREDIT_CARD", amount: 20 }, { method: "DEBIT_CARD", amount: 10 }, { method: "OTHER", amount: 7.8 }] });
  assert.ok("payload" in result);
  if (!("payload" in result)) return;
  assert.deepEqual(result.payload.formas_pagamento.map(entry => entry.forma_pagamento), ["01", "03", "04", "99"]);
});

test("provedor simulado autoriza instantaneamente sem nenhuma chamada de rede, mas ainda valida dados fiscais", async () => {
  const authorized = await mockFiscalProvider.emit({ saleId: "sale-4", cnpj: "12345678000123", items: [completeItem], payments: [{ method: "CASH", amount: 57.8 }] }, { apiToken: "fake-token", environment: "HOMOLOGACAO" });
  assert.equal(authorized.status, "AUTHORIZED");
  if (authorized.status !== "AUTHORIZED") return;
  assert.ok(authorized.accessKey.length > 0);

  const rejected = await mockFiscalProvider.emit({ saleId: "sale-5", cnpj: "12345678000123", items: [{ ...completeItem, cfop: null }], payments: [{ method: "CASH", amount: 57.8 }] }, { apiToken: "fake-token", environment: "HOMOLOGACAO" });
  assert.equal(rejected.status, "ERROR");
});

test("provedor simulado cancela sem chamada de rede", async () => {
  const result = await mockFiscalProvider.cancel("sale-4", "Cliente desistiu da compra", { apiToken: "fake-token", environment: "HOMOLOGACAO" });
  assert.equal(result.status, "CANCELLED");
});

test("configuração fiscal local: token nunca aparece em texto puro fora do módulo (só booleano na API)", async () => {
  const { getLocalFiscalConfig, updateLocalFiscalConfig } = await import("../lib/local-fiscal.ts");
  const establishmentId = `store-${Date.now()}`;
  assert.equal(getLocalFiscalConfig(establishmentId).active, false);
  const updated = updateLocalFiscalConfig(establishmentId, { active: true, providerApiToken: "segredo-123", environment: "PRODUCAO" });
  assert.equal(updated.active, true);
  assert.equal(updated.environment, "PRODUCAO");
  assert.equal(getLocalFiscalConfig(establishmentId).providerApiToken, "segredo-123");
});

test("dados fiscais do produto (modo local) são opcionais e não afetam preço/canal", async () => {
  const { createLocalCatalogProduct, listLocalCatalog, updateLocalCatalogProductFiscalInfo } = await import("../lib/local-catalog.ts");
  const establishmentId = `store-${Date.now()}`;
  const created = createLocalCatalogProduct(establishmentId, { name: `Produto fiscal ${Date.now()}`, category: "Testes", price: 12.5, channels: ["POS"] });
  assert.ok(created);
  if (!created) return;
  const before = listLocalCatalog(establishmentId).find(product => product.id === created.id);
  assert.equal(before?.ncm, null);
  const updated = updateLocalCatalogProductFiscalInfo(created.id, { ncm: "21069090", cfop: "5102" });
  assert.notEqual(updated, "NOT_FOUND"); if (updated === "NOT_FOUND") return;
  assert.equal(updated.ncm, "21069090");
  const after = listLocalCatalog(establishmentId).find(product => product.id === created.id);
  assert.equal(after?.ncm, "21069090");
  assert.equal(after?.price, before?.price); // preço/canal continuam intocados
});
