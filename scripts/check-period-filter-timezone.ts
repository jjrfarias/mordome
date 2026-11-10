import assert from "node:assert/strict";
import { shortcutRange } from "../components/admin/PeriodFilter";
const night = new Date("2026-11-10T00:28:00Z");
assert.deepEqual(shortcutRange("today", night), { from:"2026-11-09", to:"2026-11-09" });
assert.deepEqual(shortcutRange("week", night), { from:"2026-11-08", to:"2026-11-09" });
assert.deepEqual(shortcutRange("month", new Date("2026-12-01T01:00:00Z")), { from:"2026-11-01", to:"2026-11-30" });
console.log("PASS: Hoje, semana e mês seguem São Paulo mesmo na virada UTC.");
