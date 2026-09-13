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
export const USERS_VIEW = "users.view";
export const USERS_INVITE = "users.invite";
export const USERS_DISABLE = "users.disable";
export const USERS_PASSWORD_RESET = "users.password.reset";
export const ROLES_MANAGE = "roles.manage";
export const INTEGRATIONS_MANAGE = "integrations.manage";
export const PRINT_REPRINT = "print.reprint";

export const OWNER_ROLE_NAME = "Proprietário";

export const OWNER_PERMISSIONS = [ESTABLISHMENTS_MANAGE, CATALOG_MANAGE, RECIPES_MANAGE, STOCK_MANAGE, STOCK_ADJUST, POS_SELL, DISCOUNT_APPLY, DISCOUNT_OVERRIDE, SALE_REFUND, POS_CANCEL_SALE, FLOOR_OPERATE, FLOOR_MANAGE, DELIVERY_OPERATE, DELIVERY_DELIVER, TABS_CANCEL_ITEM, CASH_OPEN, CASH_MOVE, CASH_CLOSE, CASH_HISTORY_VIEW, AUDIT_VIEW, FINANCE_SUMMARY_VIEW, USERS_VIEW, USERS_INVITE, USERS_DISABLE, USERS_PASSWORD_RESET, ROLES_MANAGE, INTEGRATIONS_MANAGE, PRINT_REPRINT] as const;

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
