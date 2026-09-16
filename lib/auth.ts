import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";
import { AUDIT_VIEW, CASH_CLOSE, CASH_HISTORY_VIEW, CASH_MOVE, CASH_OPEN, CATALOG_MANAGE, DELIVERY_DELIVER, DELIVERY_OPERATE, DISCOUNT_APPLY, DISCOUNT_OVERRIDE, ESTABLISHMENTS_MANAGE, FINANCE_CASHFLOW_VIEW, FINANCE_ENTRIES_MANAGE, FINANCE_MANAGE, FINANCE_SUMMARY_VIEW, FLOOR_MANAGE, FLOOR_OPERATE, INTEGRATIONS_MANAGE, POS_CANCEL_SALE, POS_SELL, PRINT_REPRINT, RECIPES_MANAGE, ROLES_MANAGE, SALE_REFUND, SETTLEMENTS_MANAGE, STOCK_ADJUST, STOCK_MANAGE, TABS_CANCEL_ITEM, USERS_DISABLE, USERS_INVITE, USERS_PASSWORD_RESET, USERS_VIEW } from "@/lib/permissions";
import { getActiveIntegrationDriver } from "@/lib/integrations/catalog";

export const SESSION_COOKIE = "mordome_session";
const SESSION_DAYS = 7;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("pt-BR");
}

export async function createSession(userId: string, request: Request, audit: { organizationId: string; establishmentId?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const firstAccess = await db.establishmentAccess.findFirst({ where: { membership: { userId, status: "ACTIVE" }, establishment: { active: true } }, orderBy: { establishment: { name: "asc" } } });
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = request.headers.get("user-agent")?.slice(0, 500);
  const session = await db.$transaction(async tx => {
    await tx.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
    const created = await tx.session.create({
      data: { userId, activeEstablishmentId: firstAccess?.establishmentId, tokenHash: tokenHash(token), expiresAt, ipAddress, userAgent },
    });
    await tx.auditEvent.create({
      data: { organizationId: audit.organizationId, establishmentId: audit.establishmentId, actorId: userId, action: "LOGIN", entityType: "Session", entityId: created.id, reason: "Login realizado", ipAddress, userAgent },
    });
    return created;
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
  return session.id;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        include: {
          memberships: {
            where: { status: "ACTIVE" },
            include: {
              organization: true,
              accesses: { include: { establishment: true } },
              roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
              overrides: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.active) {
    if (session) await db.session.delete({ where: { id: session.id } });
    return null;
  }

  const membership = session.user.memberships[0];
  const establishments = membership?.accesses.map(access => access.establishment).filter(establishment => establishment.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) ?? [];
  const establishment = establishments.find(item => item.id === session.activeEstablishmentId) ?? establishments[0];
  if (!membership || !membership.organization.active || !establishment?.active) return null;
  const rolePermissions = new Set(membership.roles.flatMap(link => link.role.active ? link.role.permissions.map(item => item.permission.key) : []));
  const overrides = new Map(membership.overrides.map(item => [item.permission.key, item.effect]));
  const permissionContext = { organizationId: membership.organization.id, allowedEstablishmentIds: new Set(establishments.map(item => item.id)), rolePermissions, overrides };
  const permissionKeys = new Set([...rolePermissions, ...[...overrides].filter(([, effect]) => effect === "ALLOW").map(([key]) => key)]);
  for (const [key, effect] of overrides) if (effect === "DENY") permissionKeys.delete(key);
  const printerDriver = await getActiveIntegrationDriver(establishment.id, "PRINTER");
  const printTemplateRecord = await db.printTemplate.findUnique({ where: { establishmentId: establishment.id } });
  const printTemplate = {
    headerText: printTemplateRecord?.headerText ?? null,
    footerText: printTemplateRecord?.footerText ?? null,
    showDocument: printTemplateRecord?.showDocument ?? false,
    paperWidth: printTemplateRecord?.paperWidth ?? 80,
    establishmentDocument: establishment.document ?? null,
  };

  return {
    sessionId: session.id,
    user: { id: session.user.id, name: session.user.name, username: session.user.username },
    organization: { id: membership.organization.id, name: membership.organization.name },
    establishment: { id: establishment.id, name: establishment.name },
    establishments: establishments.map(item => ({ id: item.id, name: item.name })),
    permissionKeys: [...permissionKeys],
    isOwner: membership.roles.some(link => link.role.active && link.role.systemTemplate),
    canManageEstablishments: hasPermission({
      organizationId: membership.organization.id,
      allowedEstablishmentIds: new Set(establishments.map(item => item.id)),
      rolePermissions,
      overrides,
    }, ESTABLISHMENTS_MANAGE),
    canManageCatalog: hasPermission({
      organizationId: membership.organization.id,
      allowedEstablishmentIds: new Set(establishments.map(item => item.id)),
      rolePermissions,
      overrides,
    }, CATALOG_MANAGE),
    canManageStock: hasPermission({
      organizationId: membership.organization.id,
      allowedEstablishmentIds: new Set(establishments.map(item => item.id)),
      rolePermissions,
      overrides,
    }, STOCK_MANAGE),
    canAdjustStock: hasPermission(permissionContext, STOCK_ADJUST),
    canManageRecipes: hasPermission({
      organizationId: membership.organization.id,
      allowedEstablishmentIds: new Set(establishments.map(item => item.id)),
      rolePermissions,
      overrides,
    }, RECIPES_MANAGE),
    canSellPos: hasPermission({ organizationId: membership.organization.id, allowedEstablishmentIds: new Set(establishments.map(item => item.id)), rolePermissions, overrides }, POS_SELL),
    canOperateFloor: hasPermission({ organizationId: membership.organization.id, allowedEstablishmentIds: new Set(establishments.map(item => item.id)), rolePermissions, overrides }, FLOOR_OPERATE),
    canManageFloor: hasPermission(permissionContext, FLOOR_MANAGE),
    canOperateDelivery: hasPermission(permissionContext, DELIVERY_OPERATE),
    canDeliverOrders: hasPermission(permissionContext, DELIVERY_DELIVER),
    canCancelSentItems: hasPermission(permissionContext, TABS_CANCEL_ITEM),
    canCancelSales: hasPermission(permissionContext, POS_CANCEL_SALE),
    canApplyDiscount: hasPermission(permissionContext, DISCOUNT_APPLY),
    canOverrideDiscount: hasPermission(permissionContext, DISCOUNT_OVERRIDE),
    canRefundSales: hasPermission(permissionContext, SALE_REFUND),
    canOpenCash: hasPermission({ organizationId: membership.organization.id, allowedEstablishmentIds: new Set(establishments.map(item => item.id)), rolePermissions, overrides }, CASH_OPEN),
    canMoveCash: hasPermission({ organizationId: membership.organization.id, allowedEstablishmentIds: new Set(establishments.map(item => item.id)), rolePermissions, overrides }, CASH_MOVE),
    canCloseCash: hasPermission({ organizationId: membership.organization.id, allowedEstablishmentIds: new Set(establishments.map(item => item.id)), rolePermissions, overrides }, CASH_CLOSE),
    canViewCashHistory: hasPermission({ organizationId: membership.organization.id, allowedEstablishmentIds: new Set(establishments.map(item => item.id)), rolePermissions, overrides }, CASH_HISTORY_VIEW),
    canViewAudit: hasPermission({ organizationId: membership.organization.id, allowedEstablishmentIds: new Set(establishments.map(item => item.id)), rolePermissions, overrides }, AUDIT_VIEW),
    canViewFinanceSummary: hasPermission(permissionContext, FINANCE_SUMMARY_VIEW),
    canManageFinance: hasPermission(permissionContext, FINANCE_MANAGE),
    canManageFinanceEntries: hasPermission(permissionContext, FINANCE_ENTRIES_MANAGE),
    canViewFinanceCashflow: hasPermission(permissionContext, FINANCE_CASHFLOW_VIEW),
    canManageSettlements: hasPermission(permissionContext, SETTLEMENTS_MANAGE),
    canViewUsers: hasPermission(permissionContext, USERS_VIEW),
    canCreateUsers: hasPermission(permissionContext, USERS_INVITE),
    canDisableUsers: hasPermission(permissionContext, USERS_DISABLE),
    canResetUserPassword: hasPermission(permissionContext, USERS_PASSWORD_RESET),
    canManageRoles: hasPermission(permissionContext, ROLES_MANAGE),
    canManageIntegrations: hasPermission(permissionContext, INTEGRATIONS_MANAGE),
    canReprint: hasPermission(permissionContext, PRINT_REPRINT),
    printerDriver,
    printTemplate,
  };
}

export async function selectEstablishment(sessionId: string, establishmentId: string, allowedIds: string[]) {
  if (!allowedIds.includes(establishmentId)) return false;
  await db.session.update({ where: { id: sessionId }, data: { activeEstablishmentId: establishmentId, lastSeenAt: new Date() } });
  return true;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!forwardedHost) return false;
  try {
    return new URL(origin).host === forwardedHost;
  } catch {
    return false;
  }
}
