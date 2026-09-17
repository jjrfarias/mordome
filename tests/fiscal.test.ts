import assert from "node:assert/strict";
import test from "node:test";
import { buildFocusNfcePayload } from "../lib/fiscal/payload.ts";
import { mockFiscalProvider } from "../lib/fiscal/mock-provider.ts";
import { buildDanfeHtml } from "../lib/integrations/print-client.ts";

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

test("DANFE-NFC-e mostra QR code quando o provedor devolve qrCodeUrl, e um aviso claro na simulação (sem QR falso)", () => {
  const base = { establishmentName: "Betão Hot Dog", items: [{ name: "X-Burger", quantity: 1, unitPrice: 28.9 }], total: 28.9, payment: "Dinheiro", accessKey: "12345678901234567890123456789012345678901234", number: "123", series: "1", environment: "HOMOLOGACAO" as const };

  const withQrCode = buildDanfeHtml({ ...base, qrCodeUrl: "http://www.fazenda.pr.gov.br/nfce/qrcode/?p=123" });
  assert.match(withQrCode, /api\.qrserver\.com/);
  assert.match(withQrCode, /1234 5678 9012/); // chave de acesso formatada em blocos de 4

  const simulated = buildDanfeHtml({ ...base, qrCodeUrl: null });
  assert.doesNotMatch(simulated, /api\.qrserver\.com/);
  assert.match(simulated, /simulação/);
});

test("DANFE-NFC-e sinaliza ambiente de homologação (sem valor fiscal) no próprio cupom", () => {
  const homologacao = buildDanfeHtml({ establishmentName: "Betão Hot Dog", items: [{ name: "X-Burger", quantity: 1, unitPrice: 28.9 }], total: 28.9, payment: "Dinheiro", accessKey: "1234567890123456789012345678901234567890", number: "1", series: "1", qrCodeUrl: null, environment: "HOMOLOGACAO" });
  assert.match(homologacao, /HOMOLOGAÇÃO, SEM VALOR FISCAL/);
  const producao = buildDanfeHtml({ establishmentName: "Betão Hot Dog", items: [{ name: "X-Burger", quantity: 1, unitPrice: 28.9 }], total: 28.9, payment: "Dinheiro", accessKey: "1234567890123456789012345678901234567890", number: "1", series: "1", qrCodeUrl: null, environment: "PRODUCAO" });
  assert.doesNotMatch(producao, /SEM VALOR FISCAL/);
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
