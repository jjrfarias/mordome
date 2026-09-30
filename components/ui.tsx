import type { ReactNode } from "react";

export function Brand({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return <div className={`brand brand-v2 ${light ? "light" : ""}`} aria-label="Mordomê — Tudo sob controle">
    <div className="brand-mark-v2" aria-hidden="true"><span className="brand-arch"/><span className="brand-monogram">M</span><span className="brand-tray"/><i /></div>
    {!compact && <div className="brand-copy"><b>Mordomê</b><span>Tudo sob controle.</span></div>}
    {compact && <div className="brand-copy brand-copy-compact"><b>Mordomê</b><span>gestão inteligente</span></div>}
  </div>;
}

export function NavItem({ active, icon, label, badge, onClick }: { active: boolean; icon: ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button className={active ? "nav active" : "nav"} onClick={onClick}>{icon}<span>{label}</span>{badge ? <em>{badge}</em> : null}</button>;
}

export function KpiCard({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return <article className="stat"><div>{icon}</div><b>{value}</b><span>{label}</span></article>;
}

export function MetricCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) {
  return <article className="metric"><div className="metric-icon">{icon}</div><span>{label}</span><b>{value}</b><small>{note}</small></article>;
}
