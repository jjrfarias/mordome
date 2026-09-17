"use client";

import { useState, type ComponentType } from "react";
import { LayoutDashboard } from "lucide-react";
import { listAvailableDashboards } from "@/lib/dashboards/registry";
import { SalesTrackingDashboard } from "@/components/admin/dashboards/SalesTrackingDashboard";
import { MultiStoreTrackingDashboard } from "@/components/admin/dashboards/MultiStoreTrackingDashboard";
import { ChannelsDashboard } from "@/components/admin/dashboards/ChannelsDashboard";
import { SalesByHourDashboard } from "@/components/admin/dashboards/SalesByHourDashboard";

// Componente por dashboard: adicione uma entrada aqui ao registrar um dashboard novo em
// `lib/dashboards/registry.ts` — mesmo espírito de `REPORT_COMPONENTS` em `ReportsWorkspace.tsx`,
// mas sem tabela genérica/exportação (ver ADR 0042 — Dashboards é visual, Relatórios é tabular).
const DASHBOARD_COMPONENTS: Record<string, ComponentType> = {
  "sales-tracking": SalesTrackingDashboard,
  "multi-store-tracking": MultiStoreTrackingDashboard,
  "channels": ChannelsDashboard,
  "sales-by-hour": SalesByHourDashboard,
};

export function DashboardsWorkspace({ permissionKeys }: { permissionKeys: string[] }) {
  const availableDashboards = listAvailableDashboards(permissionKeys);
  const [selectedId, setSelectedId] = useState(availableDashboards[0]?.id ?? "");
  const selected = availableDashboards.find(dashboard => dashboard.id === selectedId) ?? availableDashboards[0];
  const SelectedComponent = selected ? DASHBOARD_COMPONENTS[selected.id] : undefined;

  if (availableDashboards.length === 0) {
    return <section className="page-content">
      <div className="empty big-empty">
        <LayoutDashboard />
        <h2>Nenhum dashboard disponível</h2>
        <p>Seu perfil de acesso não tem permissão para ver nenhum dashboard ainda. Peça a um administrador para liberar o acesso em Configurações → Perfis.</p>
      </div>
    </section>;
  }

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Dashboards</span><h2>{selected?.label ?? "Dashboards"}</h2></div>
      </div>
      <p className="section-note">{selected?.description}</p>
      <nav className="settings-tabs" aria-label="Dashboards disponíveis">
        {availableDashboards.map(dashboard => <button key={dashboard.id} className={dashboard.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(dashboard.id)}>{dashboard.label}</button>)}
      </nav>
    </section>
    {SelectedComponent ? <SelectedComponent /> : null}
  </section>;
}
