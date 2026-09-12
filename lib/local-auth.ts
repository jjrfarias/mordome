import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { authenticateLocalAccessUser, getLocalAccessUser, getLocalAccessUserByUsername } from "@/lib/local-access-control";
import { getLocalIntegrationDriver } from "@/lib/local-integrations";

const LOCAL_TOKEN = randomBytes(32).toString("base64url");
const LOCAL_ESTABLISHMENT_COOKIE = "mordome_local_establishment";
const LOCAL_USER_COOKIE = "mordome_local_user";
type LocalEstablishment = { id: string; name: string; slug: string; active: boolean };

const localEstablishments: LocalEstablishment[] = [
  { id: "parque-aeroporto", name: "Parque Aeroporto", slug: "parque-aeroporto", active: true },
  { id: "anexo", name: "Anexo", slug: "anexo", active: true },
  { id: "cavaleiros", name: "Cavaleiros", slug: "cavaleiros", active: true },
  { id: "lagomar", name: "Lagomar", slug: "lagomar", active: true },
];

export function isLocalAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.LOCAL_AUTH_ENABLED === "true";
}

export function localCredentialsAreValid(username: string, password: string) {
  const expectedUsername = process.env.LOCAL_AUTH_USERNAME ?? "";
  const expectedPassword = process.env.LOCAL_AUTH_PASSWORD ?? "";
  const received = Buffer.from(`${username}\0${password}`);
  const expected = Buffer.from(`${expectedUsername}\0${expectedPassword}`);
  return (received.length === expected.length && timingSafeEqual(received, expected)) || Boolean(authenticateLocalAccessUser(username, password));
}

export async function createLocalSession(username?: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, LOCAL_TOKEN, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  const user = username ? getLocalAccessUserByUsername(username) : null;
  cookieStore.set(LOCAL_USER_COOKIE, user?.userId ?? (username === (process.env.LOCAL_AUTH_USERNAME ?? "") ? "local-admin" : "local-admin"), { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
}

export async function destroyLocalSession() {
  const cookieStore = await cookies(); cookieStore.delete(SESSION_COOKIE); cookieStore.delete(LOCAL_ESTABLISHMENT_COOKIE); cookieStore.delete(LOCAL_USER_COOKIE);
}

function isValidLocalToken(token: string | undefined) {
  if (!token) return false;
  const received = Buffer.from(token);
  const expected = Buffer.from(LOCAL_TOKEN);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function getLocalSession() {
  const cookieStore = await cookies();
  if (!isValidLocalToken(cookieStore.get(SESSION_COOKIE)?.value)) return null;
  const selectedId = cookieStore.get(LOCAL_ESTABLISHMENT_COOKIE)?.value;
  const localUser = getLocalAccessUser(cookieStore.get(LOCAL_USER_COOKIE)?.value ?? "local-admin");
  const allowedIds = localUser ? new Set(localUser.establishmentIds) : new Set(localEstablishments.map(item => item.id));
  const activeEstablishments = localEstablishments.filter(item => item.active && allowedIds.has(item.id));
  const establishment = activeEstablishments.find(item => item.id === selectedId) ?? activeEstablishments[0];
  if (!establishment) return null;
  return {
    sessionId: "local",
    user: { id: localUser?.userId ?? "local-admin", name: localUser?.name ?? "Administrador Betão", username: localUser?.username ?? process.env.LOCAL_AUTH_USERNAME ?? "betao" },
    organization: { id: "local-betao", name: "Betão Hot Dog" },
    establishment,
    establishments: activeEstablishments.map(({ id, name }) => ({ id, name })),
    permissionKeys: localUser?.effectivePermissionKeys ?? ["establishments.manage", "catalog.manage", "recipes.manage", "stock.manage", "stock.adjust", "pos.sell", "discount.apply", "discount.override", "sale.refund", "pos.cancel_sale", "floor.operate", "tabs.cancel_item", "cash.open", "cash.move", "cash.close", "cash.history.view", "audit.view", "finance.summary.view", "users.view", "users.invite", "users.disable", "users.password.reset", "roles.manage", "integrations.manage"],
    isOwner: localUser?.roleIds.includes("role-owner") ?? true,
    canManageEstablishments: localUser?.effectivePermissionKeys.includes("establishments.manage") ?? true,
    canManageCatalog: localUser?.effectivePermissionKeys.includes("catalog.manage") ?? true,
    canManageStock: localUser?.effectivePermissionKeys.includes("stock.manage") ?? true,
    canAdjustStock: localUser?.effectivePermissionKeys.includes("stock.adjust") ?? true,
    canManageRecipes: localUser?.effectivePermissionKeys.includes("recipes.manage") ?? true,
    canSellPos: localUser?.effectivePermissionKeys.includes("pos.sell") ?? true,
    canOperateFloor: localUser?.effectivePermissionKeys.includes("floor.operate") ?? true,
    canCancelSentItems: localUser?.effectivePermissionKeys.includes("tabs.cancel_item") ?? true,
    canCancelSales: localUser?.effectivePermissionKeys.includes("pos.cancel_sale") ?? true,
    canApplyDiscount: localUser?.effectivePermissionKeys.includes("discount.apply") ?? true,
    canOverrideDiscount: localUser?.effectivePermissionKeys.includes("discount.override") ?? true,
    canRefundSales: localUser?.effectivePermissionKeys.includes("sale.refund") ?? true,
    canOpenCash: localUser?.effectivePermissionKeys.includes("cash.open") ?? true,
    canMoveCash: localUser?.effectivePermissionKeys.includes("cash.move") ?? true,
    canCloseCash: localUser?.effectivePermissionKeys.includes("cash.close") ?? true,
    canViewCashHistory: localUser?.effectivePermissionKeys.includes("cash.history.view") ?? true,
    canViewAudit: localUser?.effectivePermissionKeys.includes("audit.view") ?? true,
    canViewFinanceSummary: localUser?.effectivePermissionKeys.includes("finance.summary.view") ?? true,
    canViewUsers: localUser?.effectivePermissionKeys.includes("users.view") ?? true,
    canCreateUsers: localUser?.effectivePermissionKeys.includes("users.invite") ?? true,
    canDisableUsers: localUser?.effectivePermissionKeys.includes("users.disable") ?? true,
    canResetUserPassword: localUser?.effectivePermissionKeys.includes("users.password.reset") ?? true,
    canManageRoles: localUser?.effectivePermissionKeys.includes("roles.manage") ?? true,
    canManageIntegrations: localUser?.effectivePermissionKeys.includes("integrations.manage") ?? true,
    canReprint: localUser?.effectivePermissionKeys.includes("print.reprint") ?? true,
    printerDriver: getLocalIntegrationDriver(establishment.id, "PRINTER"),
  };
}

export async function selectLocalEstablishment(establishmentId: string) {
  const cookieStore = await cookies();
  const user = getLocalAccessUser(cookieStore.get(LOCAL_USER_COOKIE)?.value ?? "local-admin");
  if (!localEstablishments.some(item => item.id === establishmentId && item.active) || (user && !user.establishmentIds.includes(establishmentId))) return false;
  cookieStore.set(LOCAL_ESTABLISHMENT_COOKIE, establishmentId, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  return true;
}

export function listLocalEstablishments() {
  return localEstablishments.map(item => ({ ...item }));
}

export function createLocalEstablishment(name: string, slug: string) {
  if (localEstablishments.some(item => item.slug === slug)) return null;
  const establishment = { id: `${slug}-${Date.now()}`, name, slug, active: true };
  localEstablishments.push(establishment);
  return { ...establishment };
}

export function updateLocalEstablishment(id: string, data: { name?: string; slug?: string; active?: boolean }) {
  const establishment = localEstablishments.find(item => item.id === id);
  if (!establishment) return null;
  if (data.slug && localEstablishments.some(item => item.id !== id && item.slug === data.slug)) return "DUPLICATE" as const;
  Object.assign(establishment, data);
  return { ...establishment };
}
