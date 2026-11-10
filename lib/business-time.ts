// Sales timestamps remain UTC instants; calendar filters and grouping use the store's timezone.
export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit" });
export function businessDate(value: Date | string = new Date()) { return calendar.format(new Date(value)); }
export function businessHour(value: Date | string) { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, hour:"2-digit", hourCycle:"h23" }).format(new Date(value))); }
export function businessDayStart(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) return new Date(NaN);
  const target = Date.parse(`${day}T00:00:00Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone:BUSINESS_TIME_ZONE, year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" });
  for (let i=0;i<3;i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
    const local = Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
    const correction = target-local;
    if (!correction) break;
    instant += correction;
  }
  return new Date(instant);
}
export function businessRange(from: string, to: string) {
  const fromDate = businessDayStart(from);
  const end = businessDayStart(to);
  if (!Number.isFinite(end.getTime())) return {fromDate,toDate:end};
  const nextDay = new Date(Date.parse(`${to}T12:00:00Z`)+86400000).toISOString().slice(0,10);
  return {fromDate,toDate:new Date(businessDayStart(nextDay).getTime()-1)};
}
export function businessMonthRange(now = new Date()) {
  const day = businessDate(now);
  const last = new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7)),0,12)).toISOString().slice(0,10);
  const range = businessRange(`${day.slice(0,7)}-01`,last);
  return {from:range.fromDate,to:range.toDate};
}
