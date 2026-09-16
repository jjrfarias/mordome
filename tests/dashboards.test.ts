import assert from "node:assert/strict";
import test from "node:test";
import { listAvailableDashboards, DASHBOARDS_REGISTRY } from "../lib/dashboards/registry.ts";
import { buildHourlyRevenue, buildChannelRevenue, buildSalesTrackingKpis, buildStoreRevenue, summarizeMultiStore } from "../lib/dashboards/sales-tracking.ts";
import type { SaleRecord } from "../lib/reports/sales.ts";

test("registro de dashboards filtra pelas permissoes da sessao", () => {
  assert.equal(DASHBOARDS_REGISTRY.length, 2);
  assert.deepEqual(listAvailableDashboards([]), []);
  assert.deepEqual(listAvailableDashboards(["dashboards.sales_tracking.view"]).map(d => d.id), ["sales-tracking"]);
  assert.deepEqual(listAvailableDashboards(["dashboards.multi_store_tracking.view"]).map(d => d.id), ["multi-store-tracking"]);
  assert.deepEqual(listAvailableDashboards(["dashboards.sales_tracking.view", "dashboards.multi_store_tracking.view"]).map(d => d.id).sort(), ["multi-store-tracking", "sales-tracking"]);
});

const sales: SaleRecord[] = [
  { id: "s1", completedAt: "2026-09-16T10:15:00.000Z", channel: "POS", table: null, payment: "Dinheiro", subtotal: 100, discount: 0, total: 100, refunded: 0 },
  { id: "s2", completedAt: "2026-09-16T10:45:00.000Z", channel: "FLOOR", table: 3, payment: "Cartão", subtotal: 200, discount: 0, total: 200, refunded: 20 },
  { id: "s3", completedAt: "2026-09-16T19:00:00.000Z", channel: "DELIVERY", table: null, payment: "Pix", subtotal: 50, discount: 0, total: 50, refunded: 0 },
];

test("agregacao por hora soma faturamento liquido por hora e preserva as 24 horas", () => {
  const hourly = buildHourlyRevenue(sales);
  assert.equal(hourly.length, 24);
  const hour10 = hourly.find(point => point.hour === new Date(sales[0]!.completedAt).getHours());
  assert.equal(hour10?.revenue, 100 + (200 - 20));
  assert.equal(hour10?.salesCount, 2);
  const hourWithoutSales = hourly.find(point => point.hour === 3);
  assert.equal(hourWithoutSales?.revenue, 0);
  assert.equal(hourWithoutSales?.salesCount, 0);
});

test("agregacao por canal soma faturamento liquido por canal", () => {
  const channels = buildChannelRevenue(sales);
  assert.deepEqual(channels.map(point => point.channel), ["POS", "FLOOR", "DELIVERY"]);
  assert.equal(channels.find(point => point.channel === "FLOOR")?.revenue, 180);
  assert.equal(channels.find(point => point.channel === "POS")?.revenue, 100);
});

test("kpis do dashboard de uma unidade calculam faturamento, vendas e ticket medio", () => {
  const kpis = buildSalesTrackingKpis(sales);
  assert.equal(kpis.revenue, 100 + 180 + 50);
  assert.equal(kpis.salesCount, 3);
  assert.equal(kpis.averageTicket, kpis.revenue / 3);
});

test("agregacao multilojas soma certo entre unidades e inclui unidade sem vendas com zero", () => {
  const stores = buildStoreRevenue([
    { establishmentId: "loja-a", establishmentName: "Loja A", sales: [sales[0]!, sales[1]!] },
    { establishmentId: "loja-b", establishmentName: "Loja B", sales: [sales[2]!] },
    { establishmentId: "loja-c", establishmentName: "Loja C", sales: [] },
  ]);
  assert.equal(stores.length, 3);
  const lojaA = stores.find(store => store.establishmentId === "loja-a");
  const lojaB = stores.find(store => store.establishmentId === "loja-b");
  const lojaC = stores.find(store => store.establishmentId === "loja-c");
  assert.equal(lojaA?.revenue, 280);
  assert.equal(lojaB?.revenue, 50);
  assert.equal(lojaC?.revenue, 0);
  assert.equal(lojaC?.salesCount, 0);

  const summary = summarizeMultiStore(stores);
  assert.equal(summary.totalRevenue, 330);
  assert.equal(summary.totalSalesCount, 3);
  assert.equal(summary.averageTicket, 330 / 3);
});

test("isolamento: usuario so consolida as unidades passadas para buildStoreRevenue", () => {
  const stores = buildStoreRevenue([{ establishmentId: "loja-a", establishmentName: "Loja A", sales: [sales[0]!] }]);
  assert.equal(stores.length, 1);
  assert.equal(stores[0]?.establishmentId, "loja-a");
});
