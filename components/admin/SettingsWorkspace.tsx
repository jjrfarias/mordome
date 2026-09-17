import { useState } from "react";
import { BookOpen, Boxes, Building2, FlaskConical, LayoutGrid, ListTree, Plug, Users, Wallet, Ban, Clock, Ticket, User, Landmark, ShieldCheck, ClipboardList, FileText } from "lucide-react";
import { CatalogManagement } from "@/components/admin/CatalogManagement";
import { EstablishmentsManagement } from "@/components/admin/EstablishmentsManagement";
import { InventoryManagement } from "@/components/admin/InventoryManagement";
import { RecipeManagement } from "@/components/admin/RecipeManagement";
import { UsersManagement } from "@/components/admin/UsersManagement";
import { IntegrationsManagement } from "@/components/admin/IntegrationsManagement";
import { StationsManagement } from "@/components/admin/StationsManagement";
import { SalonManagement } from "@/components/admin/SalonManagement";
import { FinanceManagement } from "@/components/admin/FinanceManagement";
import { CancellationReasonsManagement } from "@/components/admin/CancellationReasonsManagement";
import { WorkShiftsManagement } from "@/components/admin/WorkShiftsManagement";
import { CouponsManagement } from "@/components/admin/CouponsManagement";
import { CustomersManagement } from "@/components/admin/CustomersManagement";
import { CashFrontsManagement } from "@/components/admin/CashFrontsManagement";
import { FiscalConfigManagement } from "@/components/admin/FiscalConfigManagement";
import { ProductFiscalManagement } from "@/components/admin/ProductFiscalManagement";
import { FiscalDocumentsManagement } from "@/components/admin/FiscalDocumentsManagement";

type SettingsSection = "catalog" | "inventory" | "recipes" | "establishments" | "users" | "integrations" | "stations" | "salon" | "finance" | "cancellationReasons" | "workShifts" | "coupons" | "customers" | "cashFronts" | "fiscalConfig" | "productFiscal" | "fiscalDocuments";

type SettingsWorkspaceProps = {
  activeEstablishmentId: string;
  activeEstablishmentName: string;
  canManageEstablishments: boolean;
  canManageCatalog: boolean;
  canManageStock: boolean;
  canManageRecipes: boolean;
  canViewUsers: boolean;
  canCreateUsers: boolean;
  canDisableUsers: boolean;
  canResetUserPassword: boolean;
  canManageRoles: boolean;
  canManageIntegrations: boolean;
  canManageFloor: boolean;
  canManageFinance: boolean;
  canManageFinanceEntries: boolean;
  canViewFinanceCashflow: boolean;
  canManageSettlements: boolean;
  canManageCustomers: boolean;
  canManageFiscal: boolean;
  onChanged: () => Promise<void>;
};

export function SettingsWorkspace({ activeEstablishmentId, activeEstablishmentName, canManageEstablishments, canManageCatalog, canManageStock, canManageRecipes, canViewUsers, canCreateUsers, canDisableUsers, canResetUserPassword, canManageRoles, canManageIntegrations, canManageFloor, canManageFinance, canManageFinanceEntries, canViewFinanceCashflow, canManageSettlements, canManageCustomers, canManageFiscal, onChanged }: SettingsWorkspaceProps) {
  const initialSection: SettingsSection = canManageCatalog ? "catalog" : canManageStock ? "inventory" : canManageRecipes ? "recipes" : canManageFloor ? "salon" : (canManageFinance || canManageFinanceEntries || canViewFinanceCashflow || canManageSettlements) ? "finance" : canManageEstablishments ? "establishments" : canViewUsers || canManageRoles ? "users" : "integrations";
  const [section, setSection] = useState<SettingsSection>(initialSection);

  return <div className="settings-workspace">
    <nav className="settings-tabs" aria-label="Seções de configurações">
      {canManageCatalog && <button className={section === "catalog" ? "active" : ""} onClick={() => setSection("catalog")}><BookOpen />Cardápio</button>}
      {canManageStock && <button className={section === "inventory" ? "active" : ""} onClick={() => setSection("inventory")}><Boxes />Estoque</button>}
      {canManageRecipes && <button className={section === "recipes" ? "active" : ""} onClick={() => setSection("recipes")}><FlaskConical />Fichas técnicas</button>}
      {canManageCatalog && <button className={section === "stations" ? "active" : ""} onClick={() => setSection("stations")}><ListTree />Filas de preparo</button>}
      {canManageCatalog && <button className={section === "coupons" ? "active" : ""} onClick={() => setSection("coupons")}><Ticket />Cupons de desconto</button>}
      {canManageCustomers && <button className={section === "customers" ? "active" : ""} onClick={() => setSection("customers")}><User />Clientes</button>}
      {canManageFloor && <button className={section === "salon" ? "active" : ""} onClick={() => setSection("salon")}><LayoutGrid />Salão</button>}
      {(canManageFinance || canManageFinanceEntries || canViewFinanceCashflow || canManageSettlements) && <button className={section === "finance" ? "active" : ""} onClick={() => setSection("finance")}><Wallet />Financeiro</button>}
      {canManageEstablishments && <button className={section === "establishments" ? "active" : ""} onClick={() => setSection("establishments")}><Building2 />Estabelecimentos</button>}
      {canManageEstablishments && <button className={section === "cancellationReasons" ? "active" : ""} onClick={() => setSection("cancellationReasons")}><Ban />Motivos de cancelamento</button>}
      {canManageEstablishments && <button className={section === "workShifts" ? "active" : ""} onClick={() => setSection("workShifts")}><Clock />Turnos</button>}
      {canManageEstablishments && <button className={section === "cashFronts" ? "active" : ""} onClick={() => setSection("cashFronts")}><Landmark />Frentes de caixa</button>}
      {canManageFiscal && <button className={section === "fiscalConfig" ? "active" : ""} onClick={() => setSection("fiscalConfig")}><ShieldCheck />Dados fiscais</button>}
      {canManageFiscal && <button className={section === "productFiscal" ? "active" : ""} onClick={() => setSection("productFiscal")}><ClipboardList />Dados fiscais dos produtos</button>}
      {canManageFiscal && <button className={section === "fiscalDocuments" ? "active" : ""} onClick={() => setSection("fiscalDocuments")}><FileText />Notas fiscais</button>}
      {(canViewUsers || canManageRoles) && <button className={section === "users" ? "active" : ""} onClick={() => setSection("users")}><Users />Equipe e perfis</button>}
      {canManageIntegrations && <button className={section === "integrations" ? "active" : ""} onClick={() => setSection("integrations")}><Plug />Integrações</button>}
    </nav>
    {section === "catalog" && canManageCatalog && <CatalogManagement establishmentId={activeEstablishmentId} establishmentName={activeEstablishmentName} />}
    {section === "inventory" && canManageStock && <InventoryManagement establishmentId={activeEstablishmentId} establishmentName={activeEstablishmentName} />}
    {section === "recipes" && canManageRecipes && <RecipeManagement establishmentId={activeEstablishmentId} establishmentName={activeEstablishmentName} />}
    {section === "salon" && canManageFloor && <SalonManagement activeEstablishmentId={activeEstablishmentId} />}
    {section === "establishments" && canManageEstablishments && <EstablishmentsManagement activeEstablishmentId={activeEstablishmentId} onChanged={onChanged} />}
    {section === "cancellationReasons" && canManageEstablishments && <CancellationReasonsManagement />}
    {section === "workShifts" && canManageEstablishments && <WorkShiftsManagement activeEstablishmentId={activeEstablishmentId} canViewUsers={canViewUsers} />}
    {section === "cashFronts" && canManageEstablishments && <CashFrontsManagement />}
    {section === "fiscalConfig" && canManageFiscal && <FiscalConfigManagement />}
    {section === "productFiscal" && canManageFiscal && <ProductFiscalManagement />}
    {section === "fiscalDocuments" && canManageFiscal && <FiscalDocumentsManagement />}
    {section === "users" && (canViewUsers || canManageRoles) && <UsersManagement activeEstablishmentId={activeEstablishmentId} canViewUsers={canViewUsers} canCreateUsers={canCreateUsers} canDisableUsers={canDisableUsers} canResetUserPassword={canResetUserPassword} canManageRoles={canManageRoles} onAccessChanged={onChanged} />}
    {section === "integrations" && canManageIntegrations && <IntegrationsManagement activeEstablishmentId={activeEstablishmentId} onChanged={onChanged} />}
    {section === "stations" && canManageCatalog && <StationsManagement activeEstablishmentId={activeEstablishmentId} />}
    {section === "coupons" && canManageCatalog && <CouponsManagement />}
    {section === "customers" && canManageCustomers && <CustomersManagement />}
    {section === "finance" && (canManageFinance || canManageFinanceEntries || canViewFinanceCashflow || canManageSettlements) && <FinanceManagement activeEstablishmentId={activeEstablishmentId} canManageFinance={canManageFinance} canManageFinanceEntries={canManageFinanceEntries} canViewFinanceCashflow={canViewFinanceCashflow} canManageSettlements={canManageSettlements} />}
  </div>;
}
