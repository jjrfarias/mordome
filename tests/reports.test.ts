import assert from "node:assert/strict";
import test from "node:test";
import { listAvailableReports, REPORTS_REGISTRY } from "../lib/reports/registry.ts";
import { buildSalesByPeriodRows, buildRevenueByDayRows, summarizeSalesByPeriod, summarizeRevenueByDay, type SaleRecord } from "../lib/reports/sales.ts";
import { buildStaffPerformanceRows } from "../lib/reports/staff-performance.ts";
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

  const all = listAvailableReports(["reports.sales_by_period.view", "reports.revenue_by_day.view", "reports.performance_by_staff.view", "outra.permissao"]);
  assert.deepEqual(all.map(report => report.id).sort(), ["performance-by-staff", "revenue-by-day", "sales-by-period"]);
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
