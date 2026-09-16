import assert from "node:assert/strict";
import test from "node:test";
import { listAvailableReports, REPORTS_REGISTRY } from "../lib/reports/registry.ts";
import { buildSalesByPeriodRows, buildRevenueByDayRows, summarizeSalesByPeriod, summarizeRevenueByDay, type SaleRecord } from "../lib/reports/sales.ts";
import { buildStaffPerformanceRows } from "../lib/reports/staff-performance.ts";
import { buildPaymentMethodsRows, summarizePaymentMethods } from "../lib/reports/payment-methods.ts";
import { buildSalesByDeliveryAreaRows, summarizeSalesByDeliveryArea, NO_DELIVERY_AREA_LABEL } from "../lib/reports/sales-by-delivery-area.ts";
import { buildExcelBuffer, buildPdfBuffer } from "../lib/reports/export.ts";
import { listLocalSalesForReport } from "../lib/local-finance.ts";
import { recordLocalAudit } from "../lib/local-audit.ts";

test("registro de relatorios filtra pelas permissoes da sessao", () => {
  assert.equal(REPORTS_REGISTRY.length >= 3, true);
  const noAccess = listAvailableReports([]);
  assert.equal(noAccess.length, 0);

  const onlySalesByPeriod = listAvailableReports(["reports.sales_by_period.view"]);
  assert.deepEqual(onlySalesByPeriod.map(report => report.id), ["sales-by-period"]);

  const onlyStaffPerformance = listAvailableReports(["reports.performance_by_staff.view"]);
  assert.deepEqual(onlyStaffPerformance.map(report => report.id), ["performance-by-staff"]);

  const onlyPaymentMethods = listAvailableReports(["reports.payment_methods.view"]);
  assert.deepEqual(onlyPaymentMethods.map(report => report.id), ["payment-methods"]);

  const onlySalesByDeliveryArea = listAvailableReports(["reports.sales_by_delivery_area.view"]);
  assert.deepEqual(onlySalesByDeliveryArea.map(report => report.id), ["sales-by-delivery-area"]);

  const all = listAvailableReports(["reports.sales_by_period.view", "reports.revenue_by_day.view", "reports.performance_by_staff.view", "reports.payment_methods.view", "reports.sales_by_delivery_area.view", "outra.permissao"]);
  assert.deepEqual(all.map(report => report.id).sort(), ["payment-methods", "performance-by-staff", "revenue-by-day", "sales-by-delivery-area", "sales-by-period"]);
});

const sales: SaleRecord[] = [
  { id: "s1", completedAt: "2026-09-01T10:00:00.000Z", channel: "POS", table: null, payment: "Dinheiro", subtotal: 100, discount: 10, total: 90, refunded: 0 },
  { id: "s2", completedAt: "2026-09-01T15:00:00.000Z", channel: "FLOOR", table: 3, payment: "Cartão", subtotal: 200, discount: 0, total: 200, refunded: 20 },
  { id: "s3", completedAt: "2026-09-02T09:00:00.000Z", channel: "DELIVERY", table: null, payment: "Pix", subtotal: 50, discount: 0, total: 50, refunded: 0 },
];

test("vendas por periodo calcula bruto, desconto e liquido por venda e no resumo", () => {
  const rows = buildSalesByPeriodRows(sales);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.id, "s1");
  assert.equal(rows[0]?.gross, 100);
  assert.equal(rows[0]?.discount, 10);
  assert.equal(rows[0]?.net, 90);
  assert.equal(rows[1]?.net, 180); // 200 - 20 reembolsado

  const summary = summarizeSalesByPeriod(rows);
  assert.equal(summary.count, 3);
  assert.equal(summary.totalGross, 350);
  assert.equal(summary.totalDiscount, 10);
  assert.equal(summary.totalNet, 90 + 180 + 50);
  assert.equal(summary.averageTicket, summary.totalNet / 3);
});

test("faturamento por dia agrega vendas por dia em ordem cronologica com total geral", () => {
  const rows = buildRevenueByDayRows(sales);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.date, "2026-09-01");
  assert.equal(rows[0]?.salesCount, 2);
  assert.equal(rows[0]?.gross, 300);
  assert.equal(rows[0]?.discount, 10);
  assert.equal(rows[0]?.net, 90 + 180);
  assert.equal(rows[1]?.date, "2026-09-02");
  assert.equal(rows[1]?.salesCount, 1);

  const summary = summarizeRevenueByDay(rows);
  assert.equal(summary.salesCount, 3);
  assert.equal(summary.gross, 350);
  assert.equal(summary.net, 90 + 180 + 50);
});

test("relatorios locais isolam vendas por estabelecimento e excluem canceladas/totalmente reembolsadas", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeA = `store-${crypto.randomUUID()}`;
  const storeB = `store-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";

  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-a1", after: { channel: "POS", subtotal: 100, discount: 0, total: 100, payments: [{ method: "CASH" }] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-a2", after: { channel: "POS", subtotal: 50, discount: 0, total: 50, payments: [{ method: "CASH" }] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_CANCEL", entityType: "Sale", entityId: "sale-a2" });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-a3", after: { channel: "POS", subtotal: 30, discount: 0, total: 30, payments: [{ method: "CASH" }] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_REFUND", entityType: "Sale", entityId: "sale-a3", after: { amount: 30 } });

  recordLocalAudit({ organizationId: orgId, establishmentId: storeB, actorId: userId, actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-b1", after: { channel: "POS", subtotal: 999, discount: 0, total: 999, payments: [{ method: "CASH" }] } });

  const salesA = listLocalSalesForReport(orgId, storeA, from, to);
  assert.equal(salesA.length, 1);
  assert.equal(salesA[0]?.id, "sale-a1");

  const salesB = listLocalSalesForReport(orgId, storeB, from, to);
  assert.equal(salesB.length, 1);
  assert.equal(salesB[0]?.id, "sale-b1");
});

const staffSales: SaleRecord[] = [
  { id: "st1", completedAt: "2026-09-01T10:00:00.000Z", channel: "POS", table: null, payment: "Dinheiro", subtotal: 100, discount: 0, total: 100, refunded: 0, operatorId: "u-ana", operatorName: "Ana" },
  { id: "st2", completedAt: "2026-09-01T11:00:00.000Z", channel: "POS", table: null, payment: "Dinheiro", subtotal: 50, discount: 0, total: 50, refunded: 10, operatorId: "u-ana", operatorName: "Ana" },
  { id: "st3", completedAt: "2026-09-01T12:00:00.000Z", channel: "POS", table: null, payment: "Pix", subtotal: 300, discount: 0, total: 300, refunded: 0, operatorId: "u-bruno", operatorName: "Bruno" },
  { id: "st4", completedAt: "2026-09-01T13:00:00.000Z", channel: "FLOOR", table: 1, payment: "Cartão", subtotal: 200, discount: 0, total: 200, refunded: 0, operatorId: "u-ana", operatorName: "Ana" },
  { id: "st5", completedAt: "2026-09-01T14:00:00.000Z", channel: "DELIVERY", table: null, payment: "Pix", subtotal: 999, discount: 0, total: 999, refunded: 0, operatorId: "u-ana", operatorName: "Ana" },
];

test("desempenho por pessoa: ranking por valor liquido, separado por papel (POS x FLOOR), ignora delivery", () => {
  const rows = buildStaffPerformanceRows(staffSales);

  // Ana aparece nas duas seções (PDV e Salão), com números independentes.
  const anaAttendant = rows.find(row => row.operatorId === "u-ana" && row.role === "ATTENDANT");
  const anaWaiter = rows.find(row => row.operatorId === "u-ana" && row.role === "WAITER");
  assert.ok(anaAttendant);
  assert.ok(anaWaiter);
  assert.equal(anaAttendant?.salesCount, 2);
  assert.equal(anaAttendant?.totalNet, 100 + (50 - 10)); // 140
  assert.equal(anaAttendant?.averageTicket, 140 / 2);
  assert.equal(anaWaiter?.salesCount, 1);
  assert.equal(anaWaiter?.totalNet, 200);

  const brunoAttendant = rows.find(row => row.operatorId === "u-bruno");
  assert.equal(brunoAttendant?.totalNet, 300);

  // Bruno vendeu mais que Ana no PDV: ranking decrescente por valor liquido dentro de "todas as linhas".
  const attendantRows = rows.filter(row => row.role === "ATTENDANT");
  assert.deepEqual(attendantRows.map(row => row.operatorId), ["u-bruno", "u-ana"]);

  // Delivery não gera nenhuma linha (nenhum papel de atendente/garçom associado).
  assert.equal(rows.some(row => row.operatorId === "u-ana" && row.salesCount === 3), false);
});

test("desempenho por pessoa: pessoa sem venda no periodo nao aparece", () => {
  const rows = buildStaffPerformanceRows([]);
  assert.equal(rows.length, 0);
});

test("relatorios locais propagam o operador da venda (mesmo criterio de Sale.operatorId) para o desempenho por pessoa", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeA = `store-${crypto.randomUUID()}`;
  const storeB = `store-${crypto.randomUUID()}`;
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";

  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: "user-ana", actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-op-1", after: { channel: "POS", subtotal: 100, discount: 0, total: 100, payments: [{ method: "CASH" }] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: "user-carlos", actorName: "Carlos", actorUsername: "carlos", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-op-2", after: { channel: "FLOOR", subtotal: 80, discount: 0, total: 80, payments: [{ method: "PIX" }] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeB, actorId: "user-ana", actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-op-3", after: { channel: "POS", subtotal: 999, discount: 0, total: 999, payments: [{ method: "CASH" }] } });

  const salesA = listLocalSalesForReport(orgId, storeA, from, to);
  assert.equal(salesA.length, 2);
  assert.equal(salesA.find(sale => sale.id === "sale-op-1")?.operatorId, "user-ana");
  assert.equal(salesA.find(sale => sale.id === "sale-op-1")?.operatorName, "Ana");
  assert.equal(salesA.find(sale => sale.id === "sale-op-2")?.operatorId, "user-carlos");

  const rowsA = buildStaffPerformanceRows(salesA);
  assert.equal(rowsA.length, 2);
  assert.equal(rowsA.some(row => row.operatorId === "user-ana" && row.role === "ATTENDANT"), true);
  assert.equal(rowsA.some(row => row.operatorId === "user-carlos" && row.role === "WAITER"), true);

  // Isolamento por estabelecimento: a venda de Ana na loja B não entra no ranking da loja A.
  const salesB = listLocalSalesForReport(orgId, storeB, from, to);
  assert.equal(salesB.length, 1);
  assert.equal(salesB[0]?.operatorId, "user-ana");
});

const paymentMethodSales: SaleRecord[] = [
  { id: "pm1", completedAt: "2026-09-01T10:00:00.000Z", channel: "POS", table: null, payment: "Dinheiro", subtotal: 100, discount: 0, total: 100, refunded: 0, payments: [{ method: "CASH", amount: 100 }] },
  // Venda com split: metade Pix, metade cartão de crédito - deve aparecer em AMBAS as formas.
  { id: "pm2", completedAt: "2026-09-01T11:00:00.000Z", channel: "FLOOR", table: 2, payment: "Pix + Cartão de crédito", subtotal: 200, discount: 0, total: 200, refunded: 0, payments: [{ method: "PIX", amount: 100 }, { method: "CREDIT_CARD", amount: 100 }] },
  { id: "pm3", completedAt: "2026-09-01T12:00:00.000Z", channel: "DELIVERY", table: null, payment: "Pix", subtotal: 50, discount: 0, total: 50, refunded: 0, payments: [{ method: "PIX", amount: 50 }] },
];

test("vendas por forma de pagamento: agrega por pagamento individual, venda com split aparece nas duas formas", () => {
  const rows = buildPaymentMethodsRows(paymentMethodSales);

  const cash = rows.find(row => row.method === "CASH");
  const pix = rows.find(row => row.method === "PIX");
  const creditCard = rows.find(row => row.method === "CREDIT_CARD");

  assert.ok(cash);
  assert.ok(pix);
  assert.ok(creditCard);

  assert.equal(cash?.paymentsCount, 1);
  assert.equal(cash?.totalAmount, 100);

  // Pix aparece com dois pagamentos: o split da venda pm2 (100) + a venda pm3 inteira (50).
  assert.equal(pix?.paymentsCount, 2);
  assert.equal(pix?.totalAmount, 150);
  assert.equal(pix?.methodLabel, "Pix");

  assert.equal(creditCard?.paymentsCount, 1);
  assert.equal(creditCard?.totalAmount, 100);
  assert.equal(creditCard?.methodLabel, "Cartão de crédito");

  // Ordenado por valor total recebido decrescente: Pix (150) > Cartão de crédito (100) = Dinheiro (100).
  assert.equal(rows[0]?.method, "PIX");

  const totalAmount = 100 + 150 + 100; // CASH + PIX + CREDIT_CARD
  assert.equal(pix ? Math.round(pix.share * 1000) / 1000 : null, Math.round((150 / totalAmount) * 1000) / 1000);

  const summary = summarizePaymentMethods(rows);
  assert.equal(summary.paymentsCount, 1 + 2 + 1);
  assert.equal(summary.totalAmount, totalAmount);
});

test("vendas por forma de pagamento: sem pagamentos no periodo nao gera linhas", () => {
  const rows = buildPaymentMethodsRows([]);
  assert.equal(rows.length, 0);
  const summary = summarizePaymentMethods(rows);
  assert.equal(summary.paymentsCount, 0);
  assert.equal(summary.totalAmount, 0);
});

test("relatorios locais propagam pagamentos individuais (metodo+valor) para vendas por forma de pagamento, isolado por estabelecimento", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeA = `store-${crypto.randomUUID()}`;
  const storeB = `store-${crypto.randomUUID()}`;
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";

  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: "user-ana", actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-pm-1", after: { channel: "POS", subtotal: 100, discount: 0, total: 100, payments: [{ method: "CASH", amount: 100 }] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: "user-ana", actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-pm-2", after: { channel: "FLOOR", subtotal: 200, discount: 0, total: 200, payments: [{ method: "PIX", amount: 120 }, { method: "DEBIT_CARD", amount: 80 }] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeB, actorId: "user-ana", actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-pm-3", after: { channel: "POS", subtotal: 999, discount: 0, total: 999, payments: [{ method: "CASH", amount: 999 }] } });

  const salesA = listLocalSalesForReport(orgId, storeA, from, to);
  assert.equal(salesA.length, 2);
  const rowsA = buildPaymentMethodsRows(salesA);
  assert.equal(rowsA.find(row => row.method === "CASH")?.totalAmount, 100);
  assert.equal(rowsA.find(row => row.method === "PIX")?.totalAmount, 120);
  assert.equal(rowsA.find(row => row.method === "DEBIT_CARD")?.totalAmount, 80);
  assert.equal(rowsA.some(row => row.totalAmount === 999), false); // isolamento: venda da loja B nao entra

  const salesB = listLocalSalesForReport(orgId, storeB, from, to);
  const rowsB = buildPaymentMethodsRows(salesB);
  assert.equal(rowsB.length, 1);
  assert.equal(rowsB[0]?.method, "CASH");
  assert.equal(rowsB[0]?.totalAmount, 999);
});

const deliveryAreaSales: SaleRecord[] = [
  { id: "da1", completedAt: "2026-09-01T10:00:00.000Z", channel: "DELIVERY", table: null, payment: "Pix", subtotal: 100, discount: 0, total: 110, refunded: 0, deliveryAreaId: "area-1", deliveryAreaName: "Parque Aeroporto", deliveryFee: 10 },
  { id: "da2", completedAt: "2026-09-01T11:00:00.000Z", channel: "DELIVERY", table: null, payment: "Pix", subtotal: 50, discount: 0, total: 55, refunded: 0, deliveryAreaId: "area-1", deliveryAreaName: "Parque Aeroporto", deliveryFee: 5 },
  { id: "da3", completedAt: "2026-09-01T12:00:00.000Z", channel: "DELIVERY", table: null, payment: "Dinheiro", subtotal: 200, discount: 0, total: 208, refunded: 0, deliveryAreaId: "area-2", deliveryAreaName: "Cavaleiros", deliveryFee: 8 },
  // Pedido de delivery sem area vinculada (delivery avulso) - deve cair em "Sem area definida".
  { id: "da4", completedAt: "2026-09-01T13:00:00.000Z", channel: "DELIVERY", table: null, payment: "Pix", subtotal: 30, discount: 0, total: 30, refunded: 0, deliveryAreaId: null, deliveryAreaName: null, deliveryFee: 0 },
  // Venda de outro canal nao entra no relatorio.
  { id: "da5", completedAt: "2026-09-01T14:00:00.000Z", channel: "POS", table: null, payment: "Dinheiro", subtotal: 500, discount: 0, total: 500, refunded: 0 },
];

test("vendas por area de entrega: agrega por area, soma produtos e taxa, pedido sem area vira linha propria", () => {
  const rows = buildSalesByDeliveryAreaRows(deliveryAreaSales);

  // Apenas DELIVERY entra: 3 areas (area-1, area-2, sem area) - POS ficou fora.
  assert.equal(rows.length, 3);

  const area1 = rows.find(row => row.deliveryAreaId === "area-1");
  assert.ok(area1);
  assert.equal(area1?.areaName, "Parque Aeroporto");
  assert.equal(area1?.ordersCount, 2);
  assert.equal(area1?.productsTotal, 150);
  assert.equal(area1?.deliveryFeeTotal, 15);
  assert.equal(area1?.grandTotal, 165);

  const area2 = rows.find(row => row.deliveryAreaId === "area-2");
  assert.equal(area2?.ordersCount, 1);
  assert.equal(area2?.productsTotal, 200);
  assert.equal(area2?.deliveryFeeTotal, 8);
  assert.equal(area2?.grandTotal, 208);

  const noArea = rows.find(row => row.deliveryAreaId === null);
  assert.ok(noArea);
  assert.equal(noArea?.areaName, NO_DELIVERY_AREA_LABEL);
  assert.equal(noArea?.ordersCount, 1);
  assert.equal(noArea?.productsTotal, 30);
  assert.equal(noArea?.deliveryFeeTotal, 0);
  assert.equal(noArea?.grandTotal, 30);

  // Ordenado por valor total geral decrescente: Cavaleiros (208) > Parque Aeroporto (165) > Sem area (30).
  assert.deepEqual(rows.map(row => row.areaName), ["Cavaleiros", "Parque Aeroporto", NO_DELIVERY_AREA_LABEL]);

  const summary = summarizeSalesByDeliveryArea(rows);
  assert.equal(summary.ordersCount, 4);
  assert.equal(summary.productsTotal, 150 + 200 + 30);
  assert.equal(summary.deliveryFeeTotal, 15 + 8 + 0);
  assert.equal(summary.grandTotal, 165 + 208 + 30);
});

test("vendas por area de entrega: sem pedidos de delivery no periodo nao gera linhas", () => {
  const rows = buildSalesByDeliveryAreaRows([]);
  assert.equal(rows.length, 0);
  const summary = summarizeSalesByDeliveryArea(rows);
  assert.equal(summary.ordersCount, 0);
  assert.equal(summary.grandTotal, 0);
});

test("relatorios locais propagam area de entrega/taxa para vendas por area de entrega, isolado por estabelecimento", () => {
  const orgId = `org-${crypto.randomUUID()}`;
  const storeA = `store-${crypto.randomUUID()}`;
  const storeB = `store-${crypto.randomUUID()}`;
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2026-09-30T23:59:59.999Z";

  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: "user-ana", actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-da-1", after: { channel: "DELIVERY", subtotal: 100, discount: 0, total: 110, deliveryAreaId: "area-1", deliveryAreaName: "Parque Aeroporto", deliveryFee: 10, payments: [{ method: "PIX", amount: 110 }] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeA, actorId: "user-ana", actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-da-2", after: { channel: "DELIVERY", subtotal: 40, discount: 0, total: 40, deliveryAreaId: null, deliveryAreaName: null, deliveryFee: 0, payments: [{ method: "CASH", amount: 40 }] } });
  recordLocalAudit({ organizationId: orgId, establishmentId: storeB, actorId: "user-ana", actorName: "Ana", actorUsername: "ana", action: "SALE_COMPLETE", entityType: "Sale", entityId: "sale-da-3", after: { channel: "DELIVERY", subtotal: 999, discount: 0, total: 999, deliveryAreaId: "area-9", deliveryAreaName: "Outra loja", deliveryFee: 0, payments: [{ method: "CASH", amount: 999 }] } });

  const salesA = listLocalSalesForReport(orgId, storeA, from, to);
  assert.equal(salesA.length, 2);
  const rowsA = buildSalesByDeliveryAreaRows(salesA);
  assert.equal(rowsA.find(row => row.deliveryAreaId === "area-1")?.productsTotal, 100);
  assert.equal(rowsA.find(row => row.deliveryAreaId === "area-1")?.deliveryFeeTotal, 10);
  assert.equal(rowsA.find(row => row.deliveryAreaId === null)?.productsTotal, 40);
  assert.equal(rowsA.some(row => row.productsTotal === 999), false); // isolamento: venda da loja B nao entra

  const salesB = listLocalSalesForReport(orgId, storeB, from, to);
  const rowsB = buildSalesByDeliveryAreaRows(salesB);
  assert.equal(rowsB.length, 1);
  assert.equal(rowsB[0]?.areaName, "Outra loja");
  assert.equal(rowsB[0]?.productsTotal, 999);
});

test("exportacao Excel e PDF nao lanca erro com dados validos ou vazios", async () => {
  const input = { title: "Relatório de teste", subtitle: "Período de teste", columns: [{ key: "a", label: "A" }, { key: "b", label: "B", align: "right" as const }], rows: [{ a: "x", b: 10 }, { a: "y", b: 20 }] };
  const excelBuffer = await buildExcelBuffer(input);
  assert.equal(excelBuffer.byteLength > 0, true);
  const pdfBuffer = await buildPdfBuffer(input);
  assert.equal(pdfBuffer.byteLength > 0, true);

  const emptyInput = { ...input, rows: [] };
  const emptyExcel = await buildExcelBuffer(emptyInput);
  assert.equal(emptyExcel.byteLength > 0, true);
  const emptyPdf = await buildPdfBuffer(emptyInput);
  assert.equal(emptyPdf.byteLength > 0, true);
});
