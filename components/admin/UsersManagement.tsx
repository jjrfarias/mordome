import { useEffect, useState } from "react";

type Permission = { key: string; module: string; description: string };
type Role = { id: string; name: string; active: boolean; systemTemplate: boolean; permissionKeys: string[] };
type OverrideEffect = "INHERIT" | "ALLOW" | "DENY";
type UserRow = { membershipId: string; userId: string; name: string; username: string; userActive: boolean; status: "ACTIVE" | "INVITED" | "SUSPENDED"; establishmentIds: string[]; roleIds: string[]; overrides?: { permissionKey: string; effect: "ALLOW" | "DENY"; reason: string }[]; effectivePermissionKeys?: string[]; isSelf: boolean };
type Establishment = { id: string; name: string; active: boolean };

const permissionLabels: Record<string, string> = {
  "establishments.manage": "Gerenciar estabelecimentos",
  "catalog.manage": "Gerenciar cardápio",
  "recipes.manage": "Gerenciar fichas técnicas",
  "stock.manage": "Gerenciar estoque",
  "pos.sell": "Vender no PDV",
  "pos.cancel_sale": "Cancelar vendas concluídas",
  "floor.operate": "Operar o salão",
  "floor.manage": "Configurar mesas, áreas e garçons",
  "delivery.operate": "Operar o delivery",
  "delivery.deliver": "Fazer entregas (app do entregador)",
  "tabs.cancel_item": "Cancelar itens enviados",
  "cash.open": "Abrir caixa",
  "cash.move": "Registrar suprimento e sangria",
  "cash.close": "Fechar caixa",
  "cash.history.view": "Ver histórico de caixa",
  "audit.view": "Ver histórico de auditoria",
  "finance.summary.view": "Ver resumo financeiro",
  "users.view": "Ver usuários e acessos",
  "users.invite": "Criar novos usuários",
  "users.disable": "Suspender e reativar usuários",
  "users.password.reset": "Redefinir senhas",
  "roles.manage": "Criar e editar perfis",
};
const moduleLabels: Record<string, string> = { establishments: "Estabelecimentos", catalog: "Cardápio", recipes: "Fichas técnicas", stock: "Estoque", pos: "PDV", floor: "Salão", delivery: "Delivery", cash: "Caixa", finance: "Financeiro", audit: "Auditoria", users: "Usuários", roles: "Perfis" };

function groupByModule(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) groups.set(permission.module, [...(groups.get(permission.module) ?? []), permission]);
  return [...groups.entries()];
}

type UsersManagementProps = {
  activeEstablishmentId: string;
  canViewUsers: boolean;
  canCreateUsers: boolean;
  canDisableUsers: boolean;
  canResetUserPassword: boolean;
  canManageRoles: boolean;
  onAccessChanged: () => Promise<void>;
};

export function UsersManagement({ activeEstablishmentId, canViewUsers, canCreateUsers, canDisableUsers, canResetUserPassword, canManageRoles, onAccessChanged }: UsersManagementProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);

  const [roleName, setRoleName] = useState("");
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [savingRole, setSavingRole] = useState(false);
  const [roleEdits, setRoleEdits] = useState<Record<string, string[]>>({});

  const [userForm, setUserForm] = useState({ name: "", username: "", password: "", establishmentIds: [] as string[], roleIds: [] as string[] });
  const [savingUser, setSavingUser] = useState(false);
  const [userEdits, setUserEdits] = useState<Record<string, { establishmentIds: string[]; roleIds: string[] }>>({});
  const [savingUserId, setSavingUserId] = useState("");
  const [passwordEdits, setPasswordEdits] = useState<Record<string, string>>({});
  const [overrideEdits, setOverrideEdits] = useState<Record<string, Record<string, OverrideEffect>>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [rolesResponse, usersResponse] = await Promise.all([
        fetch("/api/admin/roles", { cache: "no-store" }),
        fetch("/api/admin/users", { cache: "no-store" }),
      ]);
      const rolesData = await rolesResponse.json().catch(() => ({}));
      const usersData = await usersResponse.json().catch(() => ({}));
      if (!rolesResponse.ok) throw new Error(rolesData.error ?? "Não foi possível carregar os perfis.");
      if (!usersResponse.ok) throw new Error(usersData.error ?? "Não foi possível carregar os usuários.");
      setPermissions(rolesData.permissions ?? []);
      setRoles(rolesData.roles ?? []);
      setUsers(usersData.users ?? []);
      setEstablishments(usersData.establishments ?? []);
      setRoleEdits(Object.fromEntries((rolesData.roles ?? []).map((role: Role) => [role.id, role.permissionKeys])));
      setUserEdits(Object.fromEntries((usersData.users ?? []).map((user: UserRow) => [user.membershipId, { establishmentIds: user.establishmentIds, roleIds: user.roleIds }])));
      setOverrideEdits(Object.fromEntries((usersData.users ?? []).map((user: UserRow) => [user.membershipId, Object.fromEntries((user.overrides ?? []).map(item => [item.permissionKey, item.effect]))])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId]);

  const togglePermission = (key: string, list: string[], setList: (next: string[]) => void) => {
    setList(list.includes(key) ? list.filter(item => item !== key) : [...list, key]);
  };

  const createRole = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roleName.trim() || !rolePermissions.length || savingRole) return;
    setSavingRole(true); setError("");
    try {
      const response = await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: roleName.trim(), permissionKeys: rolePermissions }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o perfil.");
      setRoleName(""); setRolePermissions([]);
      await load();
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o perfil."); } finally { setSavingRole(false); }
  };

  const saveRolePermissions = async (roleId: string) => {
    setError("");
    try {
      const response = await fetch("/api/admin/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId, permissionKeys: roleEdits[roleId] ?? [] }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o perfil.");
      await load();
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o perfil."); }
  };

  const toggleRoleActive = async (role: Role) => {
    setError("");
    try {
      const response = await fetch("/api/admin/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: role.id, active: !role.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o perfil.");
      await load();
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o perfil."); }
  };

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userForm.name.trim() || !userForm.username.trim() || !userForm.password || !userForm.establishmentIds.length || savingUser) return;
    setSavingUser(true); setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: userForm.name.trim(), username: userForm.username.trim(), password: userForm.password, establishmentIds: userForm.establishmentIds, roleIds: userForm.roleIds }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o usuário.");
      setUserForm({ name: "", username: "", password: "", establishmentIds: [], roleIds: [] });
      await load();
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o usuário."); } finally { setSavingUser(false); }
  };

  const saveUserAccess = async (membershipId: string) => {
    const edit = userEdits[membershipId];
    if (!edit) return;
    setSavingUserId(membershipId); setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId, establishmentIds: edit.establishmentIds, roleIds: edit.roleIds }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o usuário.");
      await load();
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o usuário."); } finally { setSavingUserId(""); }
  };

  const toggleUserStatus = async (user: UserRow) => {
    setSavingUserId(user.membershipId); setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId: user.membershipId, status: user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o usuário.");
      await load();
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o usuário."); } finally { setSavingUserId(""); }
  };

  const resetPassword = async (membershipId: string) => {
    const password = passwordEdits[membershipId] ?? "";
    if (password.length < 8) { setError("A nova senha deve ter pelo menos 8 caracteres."); return; }
    setSavingUserId(membershipId); setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível redefinir a senha.");
      setPasswordEdits(current => ({ ...current, [membershipId]: "" }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível redefinir a senha."); } finally { setSavingUserId(""); }
  };

  const saveUserOverrides = async (membershipId: string) => {
    const selections = overrideEdits[membershipId] ?? {};
    const overrides = Object.entries(selections).filter(([, effect]) => effect !== "INHERIT").map(([permissionKey, effect]) => ({ permissionKey, effect }));
    const overrideReason = overrideReasons[membershipId]?.trim();
    if (overrides.length && !overrideReason) { setError("Informe por que este usuário precisa das exceções."); return; }
    setSavingUserId(membershipId); setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId, overrides, overrideReason }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar as exceções.");
      await load();
      setOverrideReasons(current => ({ ...current, [membershipId]: "" }));
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar as exceções."); } finally { setSavingUserId(""); }
  };

  const grouped = groupByModule(permissions);

  return <section className="page-content">
    {canManageRoles && <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Controle de acesso</span><h2>Perfis de permissão</h2></div>
        <div className="settings-summary"><span><i /> Perfis</span><strong>{roles.length}</strong></div>
      </div>
      <form onSubmit={createRole} className="settings-form role-form">
        <label className="field"><span>Novo perfil</span><input value={roleName} onChange={event => setRoleName(event.target.value)} placeholder="Ex.: Atendente de salão" /></label>
        <div className="permission-groups">
          {grouped.map(([moduleKey, items]) => <div key={moduleKey} className="permission-group">
            <small>{moduleLabels[moduleKey] ?? moduleKey}</small>
            {items.map(permission => <label key={permission.key} className="permission-check"><input type="checkbox" checked={rolePermissions.includes(permission.key)} onChange={() => togglePermission(permission.key, rolePermissions, setRolePermissions)} />{permissionLabels[permission.key] ?? permission.key}</label>)}
          </div>)}
        </div>
        <button type="submit" className="primary" disabled={!roleName.trim() || !rolePermissions.length || savingRole}>{savingRole ? "Criando…" : "Criar perfil"}</button>
      </form>
    </section>}

    {loading ? <div className="empty"><span>Carregando…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}

    {!loading && canManageRoles && roles.length > 0 && <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Perfis existentes</span><h2>Editar permissões</h2></div></div>
      <div className="role-list">
        {roles.map(role => <article key={role.id} className="role-card">
          <div className="role-card-head">
            <div><b>{role.name}</b>{role.systemTemplate && <span className="status-pill status-active">Padrão do sistema</span>}</div>
            {!role.systemTemplate && <button type="button" className={`secondary ${role.active ? "warn" : ""}`} onClick={() => toggleRoleActive(role)}>{role.active ? "Desativar" : "Ativar"}</button>}
          </div>
          <div className="permission-groups">
            {grouped.map(([moduleKey, items]) => <div key={moduleKey} className="permission-group">
              <small>{moduleLabels[moduleKey] ?? moduleKey}</small>
              {items.map(permission => <label key={permission.key} className="permission-check"><input type="checkbox" disabled={role.systemTemplate} checked={(roleEdits[role.id] ?? []).includes(permission.key)} onChange={() => togglePermission(permission.key, roleEdits[role.id] ?? [], next => setRoleEdits(current => ({ ...current, [role.id]: next })))} />{permissionLabels[permission.key] ?? permission.key}</label>)}
            </div>)}
          </div>
          {!role.systemTemplate && <button type="button" className="secondary" onClick={() => saveRolePermissions(role.id)}>Salvar permissões</button>}
        </article>)}
      </div>
    </section>}

    {canViewUsers && canCreateUsers && <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Equipe</span><h2>Usuários</h2></div>
        <div className="settings-summary"><span><i /> Usuários</span><strong>{users.length}</strong></div>
      </div>
      <form onSubmit={createUser} className="settings-form user-form">
        <label className="field"><span>Nome</span><input value={userForm.name} onChange={event => setUserForm(current => ({ ...current, name: event.target.value }))} placeholder="Nome completo" /></label>
        <label className="field"><span>Usuário</span><input value={userForm.username} onChange={event => setUserForm(current => ({ ...current, username: event.target.value }))} placeholder="usuario.login" /></label>
        <label className="field"><span>Senha inicial</span><input type="password" value={userForm.password} onChange={event => setUserForm(current => ({ ...current, password: event.target.value }))} placeholder="Mínimo 8 caracteres" /></label>
        <div className="field access-picker">
          <span>Unidades</span>
          <div className="permission-groups inline">{establishments.map(establishment => <label key={establishment.id} className="permission-check"><input type="checkbox" checked={userForm.establishmentIds.includes(establishment.id)} onChange={() => togglePermission(establishment.id, userForm.establishmentIds, next => setUserForm(current => ({ ...current, establishmentIds: next })))} />{establishment.name}</label>)}</div>
        </div>
        <div className="field access-picker">
          <span>Perfis</span>
          <div className="permission-groups inline">{roles.filter(role => role.active).map(role => <label key={role.id} className="permission-check"><input type="checkbox" checked={userForm.roleIds.includes(role.id)} onChange={() => togglePermission(role.id, userForm.roleIds, next => setUserForm(current => ({ ...current, roleIds: next })))} />{role.name}</label>)}</div>
        </div>
        <button className="primary" type="submit" disabled={!userForm.name.trim() || !userForm.username.trim() || !userForm.password || !userForm.establishmentIds.length || savingUser}>{savingUser ? "Criando…" : "Criar usuário"}</button>
      </form>
    </section>}

    {!loading && canViewUsers && users.length > 0 && <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Equipe</span><h2>Acesso por usuário</h2></div></div>
      <div className="role-list">
        {users.map(user => { const edit = userEdits[user.membershipId] ?? { establishmentIds: user.establishmentIds, roleIds: user.roleIds }; const isOwner = roles.some(role => role.systemTemplate && user.roleIds.includes(role.id)); return <article key={user.membershipId} className="role-card">
          <div className="role-card-head">
            <div><b>{user.name}</b><span className={`status-pill ${user.status === "SUSPENDED" ? "status-inactive" : "status-active"}`}>{user.status === "SUSPENDED" ? "Suspenso" : "Ativo"}</span></div>
            {!user.isSelf && canDisableUsers && <button type="button" className={`secondary ${user.status !== "SUSPENDED" ? "warn" : ""}`} disabled={savingUserId === user.membershipId} onClick={() => toggleUserStatus(user)}>{user.status === "SUSPENDED" ? "Reativar" : "Suspender"}</button>}
          </div>
          <small>@{user.username}</small>
          <div className="effective-access"><span>Acesso efetivo</span><div>{(user.effectivePermissionKeys ?? []).map(key => { const individual = user.overrides?.find(item => item.permissionKey === key && item.effect === "ALLOW"); const sources = roles.filter(role => user.roleIds.includes(role.id) && role.permissionKeys.includes(key)).map(role => role.name); return <small key={key} title={individual ? `Liberado individualmente: ${individual.reason}` : `Herdado de: ${sources.join(", ")}`}>{permissionLabels[key] ?? key}<em>{individual ? "Liberado individualmente" : `Perfil: ${sources.join(" + ")}`}</em></small>; })}{user.overrides?.filter(item => item.effect === "DENY").map(item => <small className="blocked" key={`blocked-${item.permissionKey}`} title={item.reason}>{permissionLabels[item.permissionKey] ?? item.permissionKey}<em>Bloqueado individualmente</em></small>)}</div></div>
          <div className="field access-picker">
            <span>Unidades</span>
            <div className="permission-groups inline">{establishments.map(establishment => <label key={establishment.id} className="permission-check"><input type="checkbox" disabled={!canManageRoles} checked={edit.establishmentIds.includes(establishment.id)} onChange={() => togglePermission(establishment.id, edit.establishmentIds, next => setUserEdits(current => ({ ...current, [user.membershipId]: { ...edit, establishmentIds: next } })))} />{establishment.name}</label>)}</div>
          </div>
          <div className="field access-picker">
            <span>Perfis</span>
            <div className="permission-groups inline">{roles.filter(role => role.active).map(role => <label key={role.id} className="permission-check"><input type="checkbox" disabled={!canManageRoles} checked={edit.roleIds.includes(role.id)} onChange={() => togglePermission(role.id, edit.roleIds, next => setUserEdits(current => ({ ...current, [user.membershipId]: { ...edit, roleIds: next } })))} />{role.name}</label>)}</div>
          </div>
          {canManageRoles && <button type="button" className="secondary" disabled={savingUserId === user.membershipId} onClick={() => saveUserAccess(user.membershipId)}>{savingUserId === user.membershipId ? "Salvando…" : "Salvar acesso"}</button>}
          {canManageRoles && !isOwner && <details className="override-panel">
            <summary>Exceções individuais <span>{user.overrides?.length ?? 0}</span></summary>
            <p>Use somente quando este usuário precisar fugir dos perfis. Bloquear sempre prevalece sobre liberar.</p>
            <div className="override-grid">{permissions.map(permission => <label key={permission.key}><span>{permissionLabels[permission.key] ?? permission.key}<small>{moduleLabels[permission.module] ?? permission.module}</small></span><select value={overrideEdits[user.membershipId]?.[permission.key] ?? "INHERIT"} onChange={event => setOverrideEdits(current => ({ ...current, [user.membershipId]: { ...(current[user.membershipId] ?? {}), [permission.key]: event.target.value as OverrideEffect } }))}><option value="INHERIT">Herdar dos perfis</option><option value="ALLOW">Liberar só para ele</option><option value="DENY">Bloquear só para ele</option></select></label>)}</div>
            <label className="field override-reason"><span>Justificativa da alteração</span><input value={overrideReasons[user.membershipId] ?? ""} onChange={event => setOverrideReasons(current => ({ ...current, [user.membershipId]: event.target.value }))} placeholder="Ex.: auxilia no fechamento às sextas-feiras" /></label>
            <button type="button" className="secondary" disabled={savingUserId === user.membershipId} onClick={() => saveUserOverrides(user.membershipId)}>{savingUserId === user.membershipId ? "Salvando…" : "Salvar exceções"}</button>
          </details>}
          {canManageRoles && isOwner && <small className="owner-protection">O perfil Proprietário mantém acesso integral para evitar bloqueio administrativo.</small>}
          {canResetUserPassword && !user.isSelf && <div className="password-reset-row"><input type="password" value={passwordEdits[user.membershipId] ?? ""} onChange={event => setPasswordEdits(current => ({ ...current, [user.membershipId]: event.target.value }))} placeholder="Nova senha (mín. 8)" /><button type="button" className="secondary" disabled={savingUserId === user.membershipId || (passwordEdits[user.membershipId]?.length ?? 0) < 8} onClick={() => resetPassword(user.membershipId)}>Redefinir senha</button></div>}
        </article>; })}
      </div>
    </section>}
  </section>;
}
