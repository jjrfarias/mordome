import test from "node:test";
import assert from "node:assert/strict";
import { businessDate, businessHour, businessRange, businessMonthRange } from "../lib/business-time.ts";
import { buildRevenueByDayRows, type SaleRecord } from "../lib/reports/sales.ts";
import { buildHourlyRevenue } from "../lib/dashboards/sales-tracking.ts";
test("noite do dia 9 continua dia 9 apesar da virada UTC",()=>{
 assert.equal(businessDate("2026-11-10T00:28:00Z"),"2026-11-09");
 assert.equal(businessHour("2026-11-10T00:28:00Z"),21);
 const range=businessRange("2026-11-09","2026-11-09");
 assert.equal(range.fromDate.toISOString(),"2026-11-09T03:00:00.000Z");
 assert.equal(range.toDate.toISOString(),"2026-11-10T02:59:59.999Z");
 assert.equal(businessDate("2026-11-10T03:00:00Z"),"2026-11-10");
 assert.ok(new Date("2026-11-10T00:28:00Z") <= range.toDate);
 assert.ok(new Date("2026-11-10T03:00:00Z") > range.toDate);
});
test("virada de mês usa o calendário da loja e rejeita datas inválidas",()=>{
 const range=businessMonthRange(new Date("2026-12-01T01:00:00Z"));
 assert.equal(range.from.toISOString(),"2026-11-01T03:00:00.000Z");
 assert.equal(range.to.toISOString(),"2026-12-01T02:59:59.999Z");
 assert.ok(Number.isNaN(businessRange("2026-02-30","2026-02-30").fromDate.getTime()));
});
test("agrupamentos diário e horário concordam com o filtro de Brasília",()=>{
 const sale:SaleRecord={id:"qa",completedAt:"2026-11-10T00:28:00Z",channel:"FLOOR",table:1,payment:"PIX",subtotal:20,discount:0,total:20,refunded:0};
 assert.equal(buildRevenueByDayRows([sale])[0].date,"2026-11-09");
 assert.equal(buildHourlyRevenue([sale]).find(row=>row.hour===21)?.revenue,20);
 assert.equal(buildHourlyRevenue([sale]).find(row=>row.hour===0)?.revenue,0);
});
