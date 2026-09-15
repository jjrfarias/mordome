import { OWNER_PERMISSIONS } from "@/lib/permissions";

export type LocalRole = { id: string; name: string; active: boolean; systemTemplate: boolean; permissionKeys: string[] };
export type LocalOverride = { permissionKey: string; effect: "ALLOW" | "DENY"; reason: string };
export type LocalUserAccess = { membershipId: string; userId: string; name: string; username: string; userActive: boolean; status: "ACTIVE" | "INVITED" | "SUSPENDED"; establishmentIds: string[]; roleIds: string[]; overrides: LocalOverride[]; isSelf: boolean };

export const localPermissionCatalog = [
  ["print.reprint", "integrations", "Reimprimir pedidos e comprovantes"],
  ["stock.adjust", "stock", "Registrar perdas, consumo interno e inventário físico"],
  ["discount.apply", "sales", "Aplicar desconto de até 10%"], ["discount.override", "sales", "Autorizar desconto acima de 10%"],
  ["sale.refund", "sales", "Registrar reembolso total ou parcial"],
  ["establishments.manage", "establishments", "Gerenciar estabelecimentos"], ["catalog.manage", "catalog", "Gerenciar cardápio"],
  ["recipes.manage", "recipes", "Gerenciar fichas técnicas"], ["stock.manage", "stock", "Gerenciar estoque"],
  ["pos.sell", "pos", "Realizar vendas no PDV"], ["floor.operate", "floor", "Operar salão e comandas"],
  ["floor.manage", "floor", "Configurar mesas, áreas e garçom responsável"],
  ["delivery.operate", "delivery", "Operar pedidos de delivery e atribuir entregador"],
  ["delivery.deliver", "delivery", "Ver as próprias entregas e compartilhar localização em rota"],
  ["pos.cancel_sale", "pos", "Cancelar vendas concluídas"], ["tabs.cancel_item", "floor", "Cancelar itens enviados à cozinha"],
  ["cash.open", "cash", "Abrir caixa"], ["cash.move", "cash", "Registrar suprimento e sangria"], ["cash.close", "cash", "Fechar caixa"],
  ["cash.history.view", "cash", "Consultar histórico de caixa"], ["finance.summary.view", "finance", "Consultar resumo financeiro"],
  ["finance.manage", "finance", "Gerenciar categorias, contas bancárias e formas de pagamento financeiras"],
  ["finance.entries.manage", "finance", "Lançar, editar e baixar contas a pagar e a receber"],
  ["finance.cashflow.view", "finance", "Consultar o fluxo de caixa consolidado"],
  ["settlements.manage", "finance", "Configurar comissões e registrar acertos pagos de entregadores e garçons"],
  ["audit.view", "audit", "Consultar histórico do sistema"], ["users.view", "users", "Consultar usuários"],
  ["users.invite", "users", "Criar usuários"], ["users.disable", "users", "Suspender e reativar usuários"],
  ["users.password.reset", "users", "Redefinir senhas"], ["roles.manage", "roles", "Gerenciar perfis de permissão"],
].map(([key, module, description]) => ({ key, module, description }));

const roles: LocalRole[] = [{ id: "role-owner", name: "Proprietário", active: true, systemTemplate: true, permissionKeys: [...OWNER_PERMISSIONS] }];
const users: LocalUserAccess[] = [{ membershipId: "membership-owner", userId: "local-admin", name: "Administrador Betão", username: "betao", userActive: true, status: "ACTIVE", establishmentIds: ["parque-aeroporto", "anexo", "cavaleiros", "lagomar"], roleIds: ["role-owner"], overrides: [], isSelf: true }];
const localPasswords = new Map<string, string>();

export function listLocalRoles() { return roles.map(role => ({ ...role, permissionKeys: [...role.permissionKeys] })); }
export function createLocalRole(name: string, permissionKeys: string[]) {
  if (roles.some(role => role.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return null;
  const role = { id: `role-${Date.now()}`, name, active: true, systemTemplate: false, permissionKeys: [...permissionKeys] };
  roles.push(role); return { ...role };
}
export function updateLocalRole(id: string, data: Partial<Pick<LocalRole, "name" | "active" | "permissionKeys">>) {
  const role = roles.find(item => item.id === id); if (!role || role.systemTemplate) return null;
  if (data.name !== undefined) role.name = data.name;
  if (data.active !== undefined) role.active = data.active;
  if (data.permissionKeys !== undefined) role.permissionKeys = [...data.permissionKeys];
  return { ...role, permissionKeys: [...role.permissionKeys] };
}
function effectiveKeys(user: LocalUserAccess) {
  const keys = new Set(roles.filter(role => role.active && user.roleIds.includes(role.id)).flatMap(role => role.permissionKeys));
  for (const override of user.overrides) {
    if (override.effect === "ALLOW") keys.add(override.permissionKey);
    else keys.delete(override.permissionKey);
  }
  return [...keys];
}
export function listLocalUsers() { return users.map(user => ({ ...user, establishmentIds: [...user.establishmentIds], roleIds: [...user.roleIds], overrides: user.overrides.map(item => ({ ...item })), effectivePermissionKeys: effectiveKeys(user) })); }
export function createLocalUser(data: { name: string; username: string; password: string; establishmentIds: string[]; roleIds: string[] }) {
  if (users.some(user => user.username === data.username)) return null;
  const stamp = Date.now().toString(); const user: LocalUserAccess = { membershipId: `membership-${stamp}`, userId: `user-${stamp}`, name: data.name, username: data.username, userActive: true, status: "ACTIVE", establishmentIds: [...data.establishmentIds], roleIds: [...data.roleIds], overrides: [], isSelf: false };
  users.push(user); localPasswords.set(user.userId, data.password); return { ...user };
}
export function updateLocalUser(id: string, data: Partial<Pick<LocalUserAccess, "status" | "establishmentIds" | "roleIds" | "overrides">> & { password?: string }) {
  const user = users.find(item => item.membershipId === id); if (!user || (user.isSelf && data.status === "SUSPENDED")) return null;
  if (data.status !== undefined) user.status = data.status;
  if (data.establishmentIds !== undefined) user.establishmentIds = [...data.establishmentIds];
  if (data.roleIds !== undefined) user.roleIds = [...data.roleIds];
  if (data.overrides !== undefined) user.overrides = data.overrides.map(item => ({ ...item }));
  if (data.password !== undefined) localPasswords.set(user.userId, data.password);
  return { ...user };
}

export function authenticateLocalAccessUser(username: string, password: string) {
  const user = users.find(item => item.username === username && item.status === "ACTIVE" && item.userActive);
  return user && localPasswords.get(user.userId) === password ? user : null;
}

export function getLocalAccessUser(userId: string) {
  const user = users.find(item => item.userId === userId && item.status === "ACTIVE" && item.userActive);
  if (!user) return null;
  return { ...user, effectivePermissionKeys: effectiveKeys(user) };
}

export function getLocalAccessUserByUsername(username: string) {
  const user = users.find(item => item.username === username);
  return user ? getLocalAccessUser(user.userId) : null;
}
