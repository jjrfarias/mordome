"use client";

import { useState, type ComponentType } from "react";
import { FileBarChart } from "lucide-react";
import { listAvailableReports } from "@/lib/reports/registry";
import { SalesByPeriodReport } from "@/components/admin/reports/SalesByPeriodReport";
import { RevenueByDayReport } from "@/components/admin/reports/RevenueByDayReport";
import { StaffPerformanceReport } from "@/components/admin/reports/StaffPerformanceReport";
import { PaymentMethodsReport } from "@/components/admin/reports/PaymentMethodsReport";
import { SalesByDeliveryAreaReport } from "@/components/admin/reports/SalesByDeliveryAreaReport";
import { ItemsSoldReport } from "@/components/admin/reports/ItemsSoldReport";
import { ItemsConsumedReport } from "@/components/admin/reports/ItemsConsumedReport";
import { ProductionTimeReport } from "@/components/admin/reports/ProductionTimeReport";
import { TimeByStatusReport } from "@/components/admin/reports/TimeByStatusReport";
import { DreReport } from "@/components/admin/reports/DreReport";

// Componente por relatório: adicione uma entrada aqui ao registrar um novo relatório em
// `lib/reports/registry.ts`. É o único outro ponto que muda ao adicionar um relatório.
const REPORT_COMPONENTS: Record<string, ComponentType> = {
  "sales-by-period": SalesByPeriodReport,
  "revenue-by-day": RevenueByDayReport,
  "performance-by-staff": StaffPerformanceReport,
  "payment-methods": PaymentMethodsReport,
  "sales-by-delivery-area": SalesByDeliveryAreaReport,
  "items-sold": ItemsSoldReport,
  "items-consumed": ItemsConsumedReport,
  "production-time": ProductionTimeReport,
  "time-by-status": TimeByStatusReport,
  "dre": DreReport,
};

export function ReportsWorkspace({ permissionKeys }: { permissionKeys: string[] }) {
  const availableReports = listAvailableReports(permissionKeys);
  const [selectedId, setSelectedId] = useState(availableReports[0]?.id ?? "");
  const selected = availableReports.find(report => report.id === selectedId) ?? availableReports[0];
  const SelectedComponent = selected ? REPORT_COMPONENTS[selected.id] : undefined;

  if (availableReports.length === 0) {
    return <section className="page-content">
      <div className="empty big-empty">
        <FileBarChart />
        <h2>Nenhum relatório disponível</h2>
        <p>Seu perfil de acesso não tem permissão para ver nenhum relatório ainda. Peça a um administrador para liberar o acesso em Configurações → Perfis.</p>
      </div>
    </section>;
  }

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Relatórios</span><h2>{selected?.label ?? "Relatórios"}</h2></div>
      </div>
      <p className="section-note">{selected?.description}</p>
      <nav className="settings-tabs" aria-label="Relatórios disponíveis">
        {availableReports.map(report => <button key={report.id} className={report.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(report.id)}>{report.label}</button>)}
      </nav>
    </section>
    {SelectedComponent ? <SelectedComponent /> : null}
  </section>;
}
