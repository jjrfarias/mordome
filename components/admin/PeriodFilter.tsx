import { businessDate, businessDayStart } from "@/lib/business-time";
// Filtro de período reutilizável (De/Até + atalhos Hoje/Esta semana/Este mês). Extraído do padrão
// que estava duplicado três vezes em `FinanceManagement.tsx` (Conciliação bancária, Fluxo de caixa
// e Acertos) — ver ADR 0033. Novas telas com filtro de período (incluindo os relatórios) devem usar
// este componente em vez de reimplementar `applyShortcut`/inputs de data.
export function toDateInput(date: Date) {
  return businessDate(date);
}

export function startOfWeek(date: Date) {
  const result = new Date(`${businessDate(date)}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() - result.getUTCDay());
  return businessDayStart(result.toISOString().slice(0, 10));
}

export function startOfMonth(date: Date) {
  return businessDayStart(`${businessDate(date).slice(0, 7)}-01`);
}

export type PeriodShortcut = "today" | "week" | "month";

export function shortcutRange(shortcut: PeriodShortcut, now = new Date()) {
  if (shortcut === "today") return { from: toDateInput(now), to: toDateInput(now) };
  if (shortcut === "week") return { from: toDateInput(startOfWeek(now)), to: toDateInput(now) };
  return { from: toDateInput(startOfMonth(now)), to: toDateInput(now) };
}

export function PeriodFilter({ from, to, onChange, label = "Período" }: { from: string; to: string; onChange: (range: { from: string; to: string }) => void; label?: string }) {
  const applyShortcut = (shortcut: PeriodShortcut) => onChange(shortcutRange(shortcut));

  return <div className="period-filter">
    <div className="period-filter-fields">
      <label className="field"><span>De</span><input type="date" value={from} onChange={event => onChange({ from: event.target.value, to })} /></label>
      <label className="field"><span>Até</span><input type="date" value={to} onChange={event => onChange({ from, to: event.target.value })} /></label>
    </div>
    <nav className="settings-tabs" aria-label={label}>
      <button type="button" onClick={() => applyShortcut("today")}>Hoje</button>
      <button type="button" onClick={() => applyShortcut("week")}>Esta semana</button>
      <button type="button" onClick={() => applyShortcut("month")}>Este mês</button>
    </nav>
  </div>;
}
