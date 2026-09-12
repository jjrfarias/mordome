import type { ReactNode } from "react";
import Image from "next/image";

export function Brand({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return <div className={`brand brand-v2 betao-lockup ${light ? "light" : ""}`} aria-label="Mordomê para Betão Hot Dog">
    <div className="betao-client-mark" aria-hidden="true"><Image src="/clientes/betao/simbolo-compacto-v1.png" alt="" width={52} height={52} priority /></div>
    {!compact && <div className="brand-copy"><b>Mordomê</b><span>para Betão Hot Dog</span></div>}
    {compact && <div className="brand-copy brand-copy-compact"><b>Mordomê</b><span>operação Betão</span></div>}
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
