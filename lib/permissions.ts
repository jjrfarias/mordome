export const ESTABLISHMENTS_MANAGE = "establishments.manage";
export const CATALOG_MANAGE = "catalog.manage";
export const RECIPES_MANAGE = "recipes.manage";
export const STOCK_MANAGE = "stock.manage";
export const STOCK_ADJUST = "stock.adjust";
export const POS_SELL = "pos.sell";
export const DISCOUNT_APPLY = "discount.apply";
export const DISCOUNT_OVERRIDE = "discount.override";
export const SALE_REFUND = "sale.refund";
export const FLOOR_OPERATE = "floor.operate";
export const FLOOR_MANAGE = "floor.manage";
export const DELIVERY_OPERATE = "delivery.operate";
export const DELIVERY_DELIVER = "delivery.deliver";
export const TABS_CANCEL_ITEM = "tabs.cancel_item";
export const POS_CANCEL_SALE = "pos.cancel_sale";
export const CASH_OPEN = "cash.open";
export const CASH_MOVE = "cash.move";
export const CASH_CLOSE = "cash.close";
export const CASH_HISTORY_VIEW = "cash.history.view";
export const AUDIT_VIEW = "audit.view";
export const FINANCE_SUMMARY_VIEW = "finance.summary.view";
export const FINANCE_MANAGE = "finance.manage";
export const FINANCE_ENTRIES_MANAGE = "finance.entries.manage";
export const FINANCE_CASHFLOW_VIEW = "finance.cashflow.view";
export const SETTLEMENTS_MANAGE = "settlements.manage";
export const USERS_VIEW = "users.view";
export const USERS_INVITE = "users.invite";
export const USERS_DISABLE = "users.disable";
export const USERS_PASSWORD_RESET = "users.password.reset";
export const ROLES_MANAGE = "roles.manage";
export const INTEGRATIONS_MANAGE = "integrations.manage";
export const PRINT_REPRINT = "print.reprint";

// Permissões de relatórios: uma chave por relatório individual (granularidade fina), seguindo o
// padrão `reports.<slug>.view` — ver ADR 0033 (framework de relatórios). Cada relatório novo no
// catálogo (`lib/reports/registry.ts`) ganha sua própria constante aqui.
export const REPORTS_SALES_BY_PERIOD_VIEW = "reports.sales_by_period.view";
export const REPORTS_REVENUE_BY_DAY_VIEW = "reports.revenue_by_day.view";
export const REPORTS_PERFORMANCE_BY_STAFF_VIEW = "reports.performance_by_staff.view";
export const REPORTS_PAYMENT_METHODS_VIEW = "reports.payment_methods.view";
export const REPORTS_SALES_BY_DELIVERY_AREA_VIEW = "reports.sales_by_delivery_area.view";
export const REPORTS_ITEMS_SOLD_VIEW = "reports.items_sold.view";
export const REPORTS_ITEMS_CONSUMED_VIEW = "reports.items_consumed.view";
export const REPORTS_PRODUCTION_TIME_VIEW = "reports.production_time.view";
export const REPORTS_TIME_BY_STATUS_VIEW = "reports.time_by_status.view";

export const OWNER_ROLE_NAME = "Proprietário";

export const OWNER_PERMISSIONS = [ESTABLISHMENTS_MANAGE, CATALOG_MANAGE, RECIPES_MANAGE, STOCK_MANAGE, STOCK_ADJUST, POS_SELL, DISCOUNT_APPLY, DISCOUNT_OVERRIDE, SALE_REFUND, POS_CANCEL_SALE, FLOOR_OPERATE, FLOOR_MANAGE, DELIVERY_OPERATE, DELIVERY_DELIVER, TABS_CANCEL_ITEM, CASH_OPEN, CASH_MOVE, CASH_CLOSE, CASH_HISTORY_VIEW, AUDIT_VIEW, FINANCE_SUMMARY_VIEW, FINANCE_MANAGE, FINANCE_ENTRIES_MANAGE, FINANCE_CASHFLOW_VIEW, SETTLEMENTS_MANAGE, USERS_VIEW, USERS_INVITE, USERS_DISABLE, USERS_PASSWORD_RESET, ROLES_MANAGE, INTEGRATIONS_MANAGE, PRINT_REPRINT, REPORTS_SALES_BY_PERIOD_VIEW, REPORTS_REVENUE_BY_DAY_VIEW, REPORTS_PERFORMANCE_BY_STAFF_VIEW, REPORTS_PAYMENT_METHODS_VIEW, REPORTS_SALES_BY_DELIVERY_AREA_VIEW, REPORTS_ITEMS_SOLD_VIEW, REPORTS_ITEMS_CONSUMED_VIEW, REPORTS_PRODUCTION_TIME_VIEW, REPORTS_TIME_BY_STATUS_VIEW] as const;

export function canDeactivateEstablishment(input: {
  establishmentId: string;
  activeEstablishmentId: string;
  activeEstablishmentCount: number;
}) {
  if (input.establishmentId === input.activeEstablishmentId) {
    return { allowed: false, reason: "Troque a unidade ativa antes de desativá-la." } as const;
  }
  if (input.activeEstablishmentCount <= 1) {
    return { allowed: false, reason: "É necessário manter pelo menos uma unidade ativa." } as const;
  }
  return { allowed: true } as const;
}
