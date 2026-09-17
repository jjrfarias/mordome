import assert from "node:assert/strict";
import test from "node:test";
import { listAvailableDashboards, DASHBOARDS_REGISTRY } from "../lib/dashboards/registry.ts";
import { buildHourlyRevenue, buildChannelRevenue, buildSalesTrackingKpis, buildStoreRevenue, summarizeMultiStore } from "../lib/dashboards/sales-tracking.ts";
import { buildChannelDailyRevenue, buildChannelKpis, rankChannels } from "../lib/dashboards/channels.ts";
import { buildHourlyAverageRevenue, summarizeSalesByHour } from "../lib/dashboards/sales-by-hour.ts";
import type { SaleRecord } from "../lib/reports/sales.ts";

test("registro de dashboards filtra pelas permissoes da sessao", () => {
  assert.equal(DASHBOARDS_REGISTRY.length, 4);
  assert.deepEqual(listAvailableDashboards([]), []);
  assert.deepEqual(listAvailableDashboards(["dashboards.sales_tracking.view"]).map(d => d.id), ["sales-tracking"]);
  assert.deepEqual(listAvailableDashboards(["dashboards.multi_store_tracking.view"]).map(d => d.id), ["multi-store-tracking"]);
  assert.deepEqual(listAvailableDashboards(["dashboards.channels.view"]).map(d => d.id), ["channels"]);
  assert.deepEqual(listAvailableDashboards(["dashboards.sales_by_hour.view"]).map(d => d.id), ["sales-by-hour"]);
  assert.deepEqual(
    listAvailableDashboards(["dashboards.sales_tracking.view", "dashboards.multi_store_tracking.view", "dashboards.channels.view", "dashboards.sales_by_hour.view"]).map(d => d.id).sort(),
    ["channels", "multi-store-tracking", "sales-by-hour", "sales-tracking"],
  );
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

// Dashboard "Canais" (ADR 0043) — vendas espalhadas por vários dias, com um canal presente só em
// um dos dias, para exercitar o preenchimento com zero das colunas por canal.
const multiDaySales: SaleRecord[] = [
  { id: "d1", completedAt: "2026-09-10T10:00:00.000Z", channel: "POS", table: null, payment: "Dinheiro", subtotal: 100, discount: 0, total: 100, refunded: 0 },
  { id: "d2", completedAt: "2026-09-10T20:00:00.000Z", channel: "FLOOR", table: 2, payment: "Cartão", subtotal: 60, discount: 0, total: 60, refunded: 0 },
  { id: "d3", completedAt: "2026-09-11T09:00:00.000Z", channel: "POS", table: null, payment: "Pix", subtotal: 40, discount: 0, total: 40, refunded: 10 },
  { id: "d4", completedAt: "2026-09-12T21:00:00.000Z", channel: "DELIVERY", table: null, payment: "Pix", subtotal: 80, discount: 0, total: 80, refunded: 0 },
];

test("canais: agregacao diaria por canal ao longo de varios dias preenche zero nos dias sem venda do canal", () => {
  const { channels, points } = buildChannelDailyRevenue(multiDaySales);
  assert.deepEqual(channels, ["POS", "FLOOR", "DELIVERY"]);
  assert.equal(points.length, 3);
  const day10 = points.find(point => point.date === "2026-09-10");
  const day11 = points.find(point => point.date === "2026-09-11");
  const day12 = points.find(point => point.date === "2026-09-12");
  assert.equal(day10?.POS, 100);
  assert.equal(day10?.FLOOR, 60);
  assert.equal(day10?.DELIVERY, 0);
  assert.equal(day11?.POS, 30);
  assert.equal(day11?.FLOOR, 0);
  assert.equal(day12?.DELIVERY, 80);
});

test("canais: participacao percentual dos canais soma 100% do periodo", () => {
  const kpis = buildChannelKpis(multiDaySales);
  const totalShare = kpis.reduce((sum, kpi) => sum + kpi.share, 0);
  assert.ok(Math.abs(totalShare - 1) < 1e-9);
  const pos = kpis.find(kpi => kpi.channel === "POS");
  assert.equal(pos?.revenue, 130);
  assert.equal(pos?.salesCount, 2);
});

test("canais: ranking ordena por faturamento decrescente", () => {
  const ranking = rankChannels(buildChannelKpis(multiDaySales));
  assert.deepEqual(ranking.map(row => row.channel), ["POS", "DELIVERY", "FLOOR"]);
});

test("canais: periodo sem vendas retorna estrutura vazia sem erro", () => {
  const { channels, points } = buildChannelDailyRevenue([]);
  assert.deepEqual(channels, []);
  assert.deepEqual(points, []);
  assert.deepEqual(buildChannelKpis([]), []);
  assert.deepEqual(rankChannels([]), []);
});

test("canais: isolamento por estabelecimento e apenas consequencia dos SaleRecord recebidos", () => {
  const onlyStoreA = buildChannelKpis([multiDaySales[0]!]);
  assert.equal(onlyStoreA.length, 1);
  assert.equal(onlyStoreA[0]?.channel, "POS");
  assert.equal(onlyStoreA[0]?.revenue, 100);
});

// Dashboard "Vendas por Data/Hora" (ADR 0043) — mesma hora em dias diferentes, para exercitar a
// media sobre multiplos dias (nao apenas a soma).
const hourlySales: SaleRecord[] = [
  { id: "h1", completedAt: "2026-09-10T19:00:00.000Z", channel: "FLOOR", table: 1, payment: "Cartão", subtotal: 100, discount: 0, total: 100, refunded: 0 },
  { id: "h2", completedAt: "2026-09-11T19:30:00.000Z", channel: "FLOOR", table: 2, payment: "Pix", subtotal: 200, discount: 0, total: 200, refunded: 0 },
  { id: "h3", completedAt: "2026-09-12T08:00:00.000Z", channel: "POS", table: null, payment: "Dinheiro", subtotal: 30, discount: 0, total: 30, refunded: 0 },
];

// Horas esperadas calculadas a partir do fuso horário local do processo (mesma técnica já usada
// pelo teste de `buildHourlyRevenue` acima), já que `buildHourlyAverageRevenue` agrupa por hora
// local (`Date.getHours()`), não por hora UTC.
const busyHour = new Date(hourlySales[0]!.completedAt).getHours();
const quietHour = new Date(hourlySales[2]!.completedAt).getHours();
const emptyHour = (busyHour + 12) % 24 === quietHour ? (busyHour + 6) % 24 : (busyHour + 12) % 24;

test("vendas por hora: media calculada corretamente sobre multiplos dias, preservando as 24 horas", () => {
  const hourly = buildHourlyAverageRevenue(hourlySales);
  assert.equal(hourly.length, 24);
  const busyPoint = hourly.find(point => point.hour === busyHour);
  assert.equal(busyPoint?.totalRevenue, 300);
  assert.equal(busyPoint?.averageRevenue, 300 / 3); // 3 dias distintos observados no periodo inteiro
  assert.equal(busyPoint?.salesCount, 2);
  const quietPoint = hourly.find(point => point.hour === quietHour);
  assert.equal(quietPoint?.totalRevenue, 30);
  assert.equal(quietPoint?.averageRevenue, 30 / 3);
  const emptyPoint = hourly.find(point => point.hour === emptyHour);
  assert.equal(emptyPoint?.totalRevenue, 0);
  assert.equal(emptyPoint?.averageRevenue, 0);
});

test("vendas por hora: kpi de horario de pico aponta a hora com maior media", () => {
  const hourly = buildHourlyAverageRevenue(hourlySales);
  const kpis = summarizeSalesByHour(hourlySales, hourly);
  assert.equal(kpis.peakHour, busyHour);
  assert.equal(kpis.daysObserved, 3);
  assert.equal(kpis.peakAverageRevenue, 300 / 3);
});

test("vendas por hora: periodo sem vendas retorna estrutura vazia sem erro", () => {
  const hourly = buildHourlyAverageRevenue([]);
  assert.equal(hourly.length, 24);
  assert.ok(hourly.every(point => point.totalRevenue === 0 && point.averageRevenue === 0));
  const kpis = summarizeSalesByHour([], hourly);
  assert.equal(kpis.peakHour, null);
  assert.equal(kpis.peakAverageRevenue, 0);
  assert.equal(kpis.daysObserved, 0);
});
