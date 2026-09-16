import assert from "node:assert/strict";
import test from "node:test";
import { buildDreReport } from "../lib/reports/dre.ts";
import { computeLocalDre, createLocalFinancialCategory, createLocalFinancialEntry, updateLocalFinancialEntry } from "../lib/local-finance.ts";
import { recordLocalAudit } from "../lib/local-audit.ts";
import { createLocalInventoryItem, configureLocalInventoryItem, addLocalStockEntry } from "../lib/local-inventory.ts";
import { createLocalRecipe } from "../lib/local-recipes.ts";

test("buildDreReport calcula cada linha e os subtotais/resultado corretamente", () => {
  // Receita bruta 1000, desconto 50, reembolso 30 -> receita liquida 920
  // CMV 200 -> lucro bruto 720
  // Despesas operacionais 300, outras receitas 40 -> resultado 720 - 300 + 40 = 460
  const report = buildDreReport({ grossRevenue: 1000, discounts: 50, refunds: 30, cmv: 200, operatingExpenses: 300, otherIncome: 40 });

  assert.equal(report.grossRevenue, 1000);
  assert.equal(report.discounts, 50);
  assert.equal(report.refunds, 30);
  assert.equal(report.netRevenue, 920);
  assert.equal(report.cmv, 200);
  assert.equal(report.grossProfit, 720);
  assert.equal(report.operatingExpenses, 300);
  assert.equal(report.otherIncome, 40);
  assert.equal(report.result, 460);

  const byKey = Object.fromEntries(report.lines.map(line => [line.key, line]));
  assert.equal(byKey.grossRevenue.value, 1000);
  assert.equal(byKey.discounts.value, -50);
  assert.equal(byKey.refunds.value, -30);
  assert.equal(byKey.netRevenue.value, 920);
  assert.equal(byKey.netRevenue.kind, "subtotal");
  assert.equal(byKey.cmv.value, -200);
  assert.equal(byKey.grossProfit.value, 720);
  assert.equal(byKey.grossProfit.kind, "subtotal");
  assert.equal(byKey.operatingExpenses.value, -300);
  assert.equal(byKey.otherIncome.value, 40);
  assert.equal(byKey.result.value, 460);
  assert.equal(byKey.result.kind, "result");
});

test("buildDreReport com prejuizo produz resultado negativo sem lancar erro", () => {
  const report = buildDreReport({ grossRevenue: 100, discounts: 0, refunds: 0, cmv: 40, operatingExpenses: 200, otherIncome: 0 });
  assert.equal(report.grossProfit, 60);
  assert.equal(report.result, -140);
});

test("buildDreReport com periodo totalmente vazio retorna tudo zerado sem erro", () => {
  const report = buildDreReport({ grossRevenue: 0, discounts: 0, refunds: 0, cmv: 0, operatingExpenses: 0, otherIncome: 0 });
  assert.equal(report.grossRevenue, 0);
  assert.equal(report.netRevenue, 0);
  assert.equal(report.grossProfit, 0);
  assert.equal(report.result, 0);
  assert.equal(report.lines.length, 9);
});

test("computeLocalDre cruza venda com desconto/reembolso, CMV com custo conhecido, despesa paga e receita avulsa", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";

  // Insumo com custo médio conhecido: 100 unidades a R$0,50 cada.
  const flour = createLocalInventoryItem(storeId, { name: `Farinha ${crypto.randomUUID()}`, baseUnit: "GRAM", trackingMode: "AUTOMATIC", minimumStock: 0, allowNegative: true });
  if (!flour) throw new Error("falha ao criar insumo");
  configureLocalInventoryItem(storeId, flour.id);
  addLocalStockEntry(storeId, flour.establishmentItemId!, 1000, 1, "Compra inicial", 500); // 1000g por R$500 = R$0,50/g

  // Ficha técnica: 1 unidade do produto consome 100g de farinha, sem perda.
  const productId = `product-${crypto.randomUUID()}`;
  createLocalRecipe(storeId, { productId, productName: "Pão especial", name: "Ficha do pão especial", yieldQuantity: 1, components: [{ inventoryItemId: flour.id, inventoryItemName: flour.name, baseUnit: "GRAM", quantity: 100, wastePercent: 0 }] });

  // Venda concluída no período: subtotal/bruto 100, desconto 10, total (já líquido) 90.
  recordLocalAudit({
    organizationId: orgId, establishmentId: storeId, actorId: userId, actorName: "Ana", actorUsername: "ana",
    action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-dre-1",
    after: { channel: "POS", subtotal: 100, discount: 10, total: 90, items: [{ productId, productName: "Pão especial", quantity: 1, unitPrice: 90 }] },
  });
  // Reembolso parcial de R$20 sobre essa venda.
  recordLocalAudit({ organizationId: orgId, establishmentId: storeId, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_REFUND", entityType: "Sale", entityId: "sale-dre-1", after: { amount: 20 } });

  // Despesa paga no período (categoria EXPENSE) e receita avulsa paga (categoria INCOME).
  const expenseCategory = createLocalFinancialCategory(orgId, `Fornecedores ${crypto.randomUUID()}`, "EXPENSE");
  const incomeCategory = createLocalFinancialCategory(orgId, `Receita avulsa ${crypto.randomUUID()}`, "INCOME");
  if (expenseCategory === "DUPLICATE" || incomeCategory === "DUPLICATE") throw new Error("categoria duplicada inesperada");
  const expenseEntry = createLocalFinancialEntry(orgId, storeId, userId, { categoryId: expenseCategory.id, description: "Aluguel", amount: 30, dueDate: "2026-09-05" });
  updateLocalFinancialEntry(storeId, expenseEntry.id, { status: "PAID" });
  const incomeEntry = createLocalFinancialEntry(orgId, storeId, userId, { categoryId: incomeCategory.id, description: "Venda de sucata", amount: 15, dueDate: "2026-09-06" });
  updateLocalFinancialEntry(storeId, incomeEntry.id, { status: "PAID" });
  // Despesa pendente (não paga) não deve entrar.
  createLocalFinancialEntry(orgId, storeId, userId, { categoryId: expenseCategory.id, description: "Conta a vencer", amount: 999, dueDate: "2026-09-20" });

  const report = computeLocalDre(orgId, storeId, from, to);

  // Sale.total (90) já é líquido de desconto (total = grossTotal - discount), então a receita
  // bruta reconstitui o valor pré-desconto: 90 + 10 = 100. Desconto = 10; reembolso = 20 ->
  // receita liquida = 100 - 10 - 20 = 70.
  assert.equal(report.grossRevenue, 100);
  assert.equal(report.discounts, 10);
  assert.equal(report.refunds, 20);
  assert.equal(report.netRevenue, 70);
  // CMV = 100g * R$0,50/g = R$50 -> lucro bruto = 70 - 50 = 20.
  assert.equal(report.cmv, 50);
  assert.equal(report.grossProfit, 20);
  // Despesas operacionais pagas = 30; outras receitas pagas = 15 -> resultado = 20 - 30 + 15 = 5.
  assert.equal(report.operatingExpenses, 30);
  assert.equal(report.otherIncome, 15);
  assert.equal(report.result, 5);
});

test("computeLocalDre isola por estabelecimento", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeA = `store-a-${crypto.randomUUID()}`;
  const storeB = `store-b-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";

  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-a", after: { channel: "POS", subtotal: 50, discount: 0, total: 50, items: [] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeB, actorId: userId, actorName: "Bia", actorUsername: "bia", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-b", after: { channel: "POS", subtotal: 999, discount: 0, total: 999, items: [] } });

  const reportA = computeLocalDre(orgId, storeA, from, to);
  const reportB = computeLocalDre(orgId, storeB, from, to);

  assert.equal(reportA.grossRevenue, 50);
  assert.equal(reportB.grossRevenue, 999);
});

test("computeLocalDre em periodo sem nenhum dado retorna tudo zerado sem erro", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeId = `store-${crypto.randomUUID()}`;
  const report = computeLocalDre(orgId, storeId, "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z");
  assert.equal(report.grossRevenue, 0);
  assert.equal(report.netRevenue, 0);
  assert.equal(report.cmv, 0);
  assert.equal(report.grossProfit, 0);
  assert.equal(report.operatingExpenses, 0);
  assert.equal(report.otherIncome, 0);
  assert.equal(report.result, 0);
});
