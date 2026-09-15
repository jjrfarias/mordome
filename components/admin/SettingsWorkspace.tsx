import { useState } from "react";
import { BookOpen, Boxes, Building2, FlaskConical, LayoutGrid, ListTree, Plug, Users, Wallet } from "lucide-react";
import { CatalogManagement } from "@/components/admin/CatalogManagement";
import { EstablishmentsManagement } from "@/components/admin/EstablishmentsManagement";
import { InventoryManagement } from "@/components/admin/InventoryManagement";
import { RecipeManagement } from "@/components/admin/RecipeManagement";
import { UsersManagement } from "@/components/admin/UsersManagement";
import { IntegrationsManagement } from "@/components/admin/IntegrationsManagement";
import { StationsManagement } from "@/components/admin/StationsManagement";
import { SalonManagement } from "@/components/admin/SalonManagement";
import { FinanceManagement } from "@/components/admin/FinanceManagement";

type SettingsSection = "catalog" | "inventory" | "recipes" | "establishments" | "users" | "integrations" | "stations" | "salon" | "finance";

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
  onChanged: () => Promise<void>;
};

export function SettingsWorkspace({ activeEstablishmentId, activeEstablishmentName, canManageEstablishments, canManageCatalog, canManageStock, canManageRecipes, canViewUsers, canCreateUsers, canDisableUsers, canResetUserPassword, canManageRoles, canManageIntegrations, canManageFloor, canManageFinance, canManageFinanceEntries, canViewFinanceCashflow, onChanged }: SettingsWorkspaceProps) {
  const initialSection: SettingsSection = canManageCatalog ? "catalog" : canManageStock ? "inventory" : canManageRecipes ? "recipes" : canManageFloor ? "salon" : (canManageFinance || canManageFinanceEntries || canViewFinanceCashflow) ? "finance" : canManageEstablishments ? "establishments" : canViewUsers || canManageRoles ? "users" : "integrations";
  const [section, setSection] = useState<SettingsSection>(initialSection);

  return <div className="settings-workspace">
    <nav className="settings-tabs" aria-label="Seções de configurações">
      {canManageCatalog && <button className={section === "catalog" ? "active" : ""} onClick={() => setSection("catalog")}><BookOpen />Cardápio</button>}
      {canManageStock && <button className={section === "inventory" ? "active" : ""} onClick={() => setSection("inventory")}><Boxes />Estoque</button>}
      {canManageRecipes && <button className={section === "recipes" ? "active" : ""} onClick={() => setSection("recipes")}><FlaskConical />Fichas técnicas</button>}
      {canManageCatalog && <button className={section === "stations" ? "active" : ""} onClick={() => setSection("stations")}><ListTree />Filas de preparo</button>}
      {canManageFloor && <button className={section === "salon" ? "active" : ""} onClick={() => setSection("salon")}><LayoutGrid />Salão</button>}
      {(canManageFinance || canManageFinanceEntries || canViewFinanceCashflow) && <button className={section === "finance" ? "active" : ""} onClick={() => setSection("finance")}><Wallet />Financeiro</button>}
      {canManageEstablishments && <button className={section === "establishments" ? "active" : ""} onClick={() => setSection("establishments")}><Building2 />Estabelecimentos</button>}
      {(canViewUsers || canManageRoles) && <button className={section === "users" ? "active" : ""} onClick={() => setSection("users")}><Users />Equipe e perfis</button>}
      {canManageIntegrations && <button className={section === "integrations" ? "active" : ""} onClick={() => setSection("integrations")}><Plug />Integrações</button>}
    </nav>
    {section === "catalog" && canManageCatalog && <CatalogManagement establishmentId={activeEstablishmentId} establishmentName={activeEstablishmentName} />}
    {section === "inventory" && canManageStock && <InventoryManagement establishmentId={activeEstablishmentId} establishmentName={activeEstablishmentName} />}
    {section === "recipes" && canManageRecipes && <RecipeManagement establishmentId={activeEstablishmentId} establishmentName={activeEstablishmentName} />}
    {section === "salon" && canManageFloor && <SalonManagement activeEstablishmentId={activeEstablishmentId} />}
    {section === "establishments" && canManageEstablishments && <EstablishmentsManagement activeEstablishmentId={activeEstablishmentId} onChanged={onChanged} />}
    {section === "users" && (canViewUsers || canManageRoles) && <UsersManagement activeEstablishmentId={activeEstablishmentId} canViewUsers={canViewUsers} canCreateUsers={canCreateUsers} canDisableUsers={canDisableUsers} canResetUserPassword={canResetUserPassword} canManageRoles={canManageRoles} onAccessChanged={onChanged} />}
    {section === "integrations" && canManageIntegrations && <IntegrationsManagement activeEstablishmentId={activeEstablishmentId} onChanged={onChanged} />}
    {section === "stations" && canManageCatalog && <StationsManagement activeEstablishmentId={activeEstablishmentId} />}
    {section === "finance" && (canManageFinance || canManageFinanceEntries || canViewFinanceCashflow) && <FinanceManagement activeEstablishmentId={activeEstablishmentId} canManageFinance={canManageFinance} canManageFinanceEntries={canManageFinanceEntries} canViewFinanceCashflow={canViewFinanceCashflow} />}
  </div>;
}
