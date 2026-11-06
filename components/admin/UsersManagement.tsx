import { useCallback, useEffect, useState } from "react";

import { Plus, Search, Users, ShieldCheck, X, ChevronRight } from "lucide-react";
import { PermissionPicker } from "./PermissionPicker";
import { permissionLabel, permissionModule } from "@/lib/permission-presentation";
import styles from "./users-management.module.css";

type Permission = { key: string; module: string; description: string };
type Role = { id: string; name: string; active: boolean; systemTemplate: boolean; permissionKeys: string[] };
type OverrideEffect = "INHERIT" | "ALLOW" | "DENY";
type UserRow = { membershipId: string; userId: string; name: string; username: string; email?: string | null; pendingEmail?: string | null; emailVerified?: boolean; userActive: boolean; status: "ACTIVE" | "INVITED" | "SUSPENDED"; establishmentIds: string[]; roleIds: string[]; overrides?: { permissionKey: string; effect: "ALLOW" | "DENY"; reason: string }[]; effectivePermissionKeys?: string[]; isSelf: boolean };
type Establishment = { id: string; name: string; active: boolean };

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
  const [tab, setTab] = useState<"users" | "roles">(canViewUsers ? "users" : "roles");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [roleBusy, setRoleBusy] = useState(false);
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

  const [userForm, setUserForm] = useState({ name: "", username: "", email: "", establishmentIds: [] as string[], roleIds: [] as string[] });
  const [savingUser, setSavingUser] = useState(false);
  const [userEdits, setUserEdits] = useState<Record<string, { establishmentIds: string[]; roleIds: string[] }>>({});
  const [savingUserId, setSavingUserId] = useState("");
  const [passwordEdits, setPasswordEdits] = useState<Record<string, string>>({});
  const [overrideEdits, setOverrideEdits] = useState<Record<string, Record<string, OverrideEffect>>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [rolesResponse, usersResponse] = await Promise.all([
        fetch("/api/admin/roles", { cache: "no-store" }),
        canViewUsers ? fetch("/api/admin/users", { cache: "no-store" }) : Promise.resolve(new Response(JSON.stringify({ users: [], establishments: [] }))),
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
  }, [canViewUsers]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId, load]);

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
      setRoleName(""); setRolePermissions([]); setShowCreateRole(false); setMessage("Perfil criado.");
      await load();
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o perfil."); } finally { setSavingRole(false); }
  };

  const saveRolePermissions = async (roleId: string) => {
    if (roleBusy) return;
    setRoleBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId, permissionKeys: roleEdits[roleId] ?? [] }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o perfil.");
      await load();
      setMessage("Perfil atualizado.");
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o perfil."); } finally { setRoleBusy(false); }
  };

  const toggleRoleActive = async (role: Role) => {
    if (roleBusy) return;
    setRoleBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: role.id, active: !role.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o perfil.");
      await load();
      setMessage("Perfil atualizado.");
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o perfil."); } finally { setRoleBusy(false); }
  };

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userForm.name.trim() || !userForm.username.trim() || !userForm.establishmentIds.length || savingUser) return;
    setSavingUser(true); setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: userForm.name.trim(), username: userForm.username.trim(), email: userForm.email.trim(), establishmentIds: userForm.establishmentIds, roleIds: userForm.roleIds }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o usuário.");
      setShowCreateUser(false); setMessage(data.message ?? "Convite solicitado.");
      setUserForm({ name: "", username: "", email: "", establishmentIds: [], roleIds: [] });
      await load();
      await onAccessChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o usuário."); } finally { setSavingUser(false); }
  };

  const resendInvite = async (membershipId: string) => {
    setSavingUserId(membershipId); setError("");
    try {
      const response = await fetch("/api/admin/users/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível reenviar o convite.");
      setMessage(data.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível reenviar o convite."); }
    finally { setSavingUserId(""); }
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
      setMessage("Acesso do usuário atualizado.");
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
      setMessage("Acesso do usuário atualizado.");
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
      setPasswordEdits(current => ({ ...current, [membershipId]: "" })); setMessage("Senha redefinida e sessões anteriores encerradas.");
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

  const currentUser = users.find(user => user.membershipId === selectedUser);
  const currentRole = roles.find(role => role.id === selectedRole);
  const matches = (value: string) => value.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"));
  const filteredUsers = users.filter(user => matches(`${user.name} ${user.username} ${user.email ?? user.pendingEmail ?? ""}`) && (statusFilter === "all" || (statusFilter === "active" ? user.userActive && user.status === "ACTIVE" : !user.userActive || user.status !== "ACTIVE")));
  const filteredRoles = roles.filter(role => matches(role.name));
  const roleNames = (ids: string[]) => roles.filter(role => ids.includes(role.id)).map(role => role.name).join(", ") || "Sem perfil";
  const unitNames = (ids: string[]) => establishments.filter(unit => ids.includes(unit.id)).map(unit => unit.name).join(", ") || "Sem unidade";
  const emailStatus = (user: UserRow) => user.emailVerified ? "Confirmado" : user.pendingEmail ? "Aguardando confirmação" : "Não cadastrado";
  const accessChoices = (values: { establishmentIds: string[]; roleIds: string[] }, change: (next: typeof values) => void, disabled = false) => <div className={styles.accessColumns}>
    <fieldset><legend>Unidades de acesso</legend>{establishments.filter(unit => unit.active || values.establishmentIds.includes(unit.id)).map(unit => <label className={styles.check} key={unit.id}><input type="checkbox" disabled={disabled || (!unit.active && !values.establishmentIds.includes(unit.id))} checked={values.establishmentIds.includes(unit.id)} onChange={() => togglePermission(unit.id, values.establishmentIds, next => change({ ...values, establishmentIds: next }))} /><span>{unit.name}{!unit.active && " (inativa)"}</span></label>)}</fieldset>
    <fieldset><legend>Perfis de acesso</legend>{roles.filter(role => role.active || values.roleIds.includes(role.id)).map(role => <label className={styles.check} key={role.id}><input type="checkbox" disabled={disabled || (!role.active && !values.roleIds.includes(role.id))} checked={values.roleIds.includes(role.id)} onChange={() => togglePermission(role.id, values.roleIds, next => change({ ...values, roleIds: next }))} /><span>{role.name}{!role.active && " (inativo)"}</span></label>)}</fieldset>
  </div>;

  return <section className={styles.workspace} aria-label="Gestão da equipe">
    <div className={styles.heading}><div><span className={styles.kicker}>CONTROLE DE ACESSO</span><h2>Equipe e perfis</h2><p>Organize quem acessa cada unidade e o que pode fazer.</p></div><div className={styles.metrics}><span><strong>{users.filter(user => user.userActive && user.status === "ACTIVE").length}</strong> usuários ativos</span><span><strong>{roles.filter(role => role.active).length}</strong> perfis ativos</span></div></div>
    <nav className={styles.tabs} aria-label="Gestão de acessos">{canViewUsers && <button type="button" aria-pressed={tab === "users"} onClick={() => { setTab("users"); setQuery(""); }}><Users size={18} />Usuários <span>{users.length}</span></button>}{canManageRoles && <button type="button" aria-pressed={tab === "roles"} onClick={() => { setTab("roles"); setQuery(""); }}><ShieldCheck size={18} />Perfis <span>{roles.length}</span></button>}</nav>
    {error && <div className={styles.error} role="alert">{error}<button type="button" onClick={() => void load()}>Atualizar dados</button></div>}
    {message && <div className={styles.notice} role="status">{message}<button type="button" aria-label="Fechar aviso" onClick={() => setMessage("")}><X size={16} /></button></div>}
    {loading ? <p role="status" className={styles.empty}>Carregando equipe e perfis…</p> : <>
      <div className={styles.toolbar}><label className={styles.search}><Search size={18} /><input type="search" aria-label={tab === "users" ? "Buscar usuário" : "Buscar perfil"} value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === "users" ? "Buscar por nome, usuário ou e-mail" : "Buscar perfil"} /></label>{tab === "users" && <select aria-label="Filtrar situação" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Todos os usuários</option><option value="active">Ativos</option><option value="inactive">Suspensos ou inativos</option></select>}{tab === "users" ? canCreateUsers && <button type="button" className="primary" onClick={() => { setShowCreateUser(true); setSelectedUser(null); setError(""); }}><Plus size={18} />Novo usuário</button> : <button type="button" className="primary" onClick={() => { setShowCreateRole(true); setSelectedRole(null); setError(""); }}><Plus size={18} />Novo perfil</button>}</div>
      {tab === "users" && showCreateUser && <section className={styles.editor} aria-labelledby="new-user-title"><div className={styles.editorHead}><div><h3 id="new-user-title">Novo usuário</h3><p>Escolha os acessos. O usuário receberá um convite para confirmar o e-mail e criar a própria senha.</p></div><button type="button" className={styles.close} aria-label="Fechar cadastro" onClick={() => setShowCreateUser(false)}><X /></button></div>
        <form onSubmit={createUser}><div className={styles.fields}><label>Nome completo<input required minLength={2} maxLength={100} autoComplete="off" value={userForm.name} onChange={event => setUserForm(current => ({ ...current, name: event.target.value }))} /></label><label>E-mail<input type="email" required maxLength={254} autoComplete="off" value={userForm.email} onChange={event => setUserForm(current => ({ ...current, email: event.target.value }))} /></label><label>Nome de usuário<input required minLength={3} maxLength={40} pattern="[A-Za-z0-9._\-]+" autoComplete="off" value={userForm.username} onChange={event => setUserForm(current => ({ ...current, username: event.target.value }))} /><small>Sem espaços. Use letras, números, ponto ou hífen.</small></label></div>
          {accessChoices(userForm, next => setUserForm(current => ({ ...current, ...next })))}
          <div className={styles.actions}><button type="submit" className="primary" disabled={savingUser || !userForm.roleIds.length || !userForm.establishmentIds.length}>{savingUser ? "Criando…" : "Enviar convite"}</button><button type="button" className="secondary" onClick={() => setShowCreateUser(false)}>Cancelar</button></div></form>
      </section>}
      {tab === "users" && currentUser && (() => {
        const user = currentUser;
        const edit = userEdits[user.membershipId] ?? { establishmentIds: user.establishmentIds, roleIds: user.roleIds };
        const owner = roles.some(role => role.systemTemplate && user.roleIds.includes(role.id));
        return <section className={styles.editor} aria-labelledby="edit-user-title"><div className={styles.editorHead}><div><h3 id="edit-user-title">{user.name}</h3><p>@{user.username} · {user.email ?? user.pendingEmail ?? "E-mail não cadastrado"} · {emailStatus(user)}</p></div><button type="button" className={styles.close} aria-label="Fechar edição do usuário" onClick={() => setSelectedUser(null)}><X /></button></div>
          {accessChoices(edit, next => setUserEdits(current => ({ ...current, [user.membershipId]: next })), !canManageRoles)}
          <div className={styles.actions}>{user.status === "INVITED" && canCreateUsers && <button type="button" className="primary" disabled={savingUserId === user.membershipId} onClick={() => void resendInvite(user.membershipId)}>Reenviar convite</button>}{canManageRoles && <button type="button" className="primary" disabled={savingUserId === user.membershipId} onClick={() => void saveUserAccess(user.membershipId)}>Salvar acessos</button>}{!user.isSelf && canDisableUsers && <button type="button" className="secondary" disabled={savingUserId === user.membershipId} onClick={() => { if (window.confirm(user.status === "SUSPENDED" ? `Reativar o acesso de ${user.name}?` : `Suspender o acesso de ${user.name}?`)) void toggleUserStatus(user); }}>{user.status === "SUSPENDED" ? "Reativar usuário" : "Suspender usuário"}</button>}</div>
          {owner && <p className={styles.help}>O perfil Proprietário mantém acesso integral e não aceita exceções individuais.</p>}
          <details className={styles.advanced}><summary>Acessos efetivos ({user.effectivePermissionKeys?.length ?? 0})</summary><div className={styles.effective}>{(user.effectivePermissionKeys ?? []).map(key => <span key={key}>{permissionLabel(permissions.find(p => p.key === key) ?? { key, description: key, module: "" })}</span>)}</div></details>
          {canManageRoles && !owner && <details className={styles.advanced}><summary>Exceções individuais ({user.overrides?.length ?? 0})</summary><p>Use apenas quando os perfis não atenderem. Um bloqueio individual prevalece sobre a liberação.</p><div className={styles.overrides}>{permissions.map(permission => <label key={permission.key}><span>{permissionLabel(permission)}<small>{permissionModule(permission)}</small></span><select aria-label={`Exceção: ${permissionLabel(permission)}`} value={overrideEdits[user.membershipId]?.[permission.key] ?? "INHERIT"} onChange={event => setOverrideEdits(current => ({ ...current, [user.membershipId]: { ...(current[user.membershipId] ?? {}), [permission.key]: event.target.value as OverrideEffect } }))}><option value="INHERIT">Herdar dos perfis</option><option value="ALLOW">Liberar para este usuário</option><option value="DENY">Bloquear para este usuário</option></select></label>)}</div><label className={styles.reason}>Justificativa<input value={overrideReasons[user.membershipId] ?? ""} onChange={event => setOverrideReasons(current => ({ ...current, [user.membershipId]: event.target.value }))} /></label><button type="button" className="secondary" disabled={savingUserId === user.membershipId} onClick={() => void saveUserOverrides(user.membershipId)}>Salvar exceções</button></details>}
          {canResetUserPassword && !user.isSelf && user.status !== "INVITED" && <details className={styles.advanced}><summary>Redefinir senha</summary><p>As sessões abertas serão encerradas. Informe a nova senha ao usuário por um canal seguro.</p><div className={styles.reset}><label>Nova senha<input type="password" autoComplete="new-password" value={passwordEdits[user.membershipId] ?? ""} onChange={event => setPasswordEdits(current => ({ ...current, [user.membershipId]: event.target.value }))} /></label><button type="button" className="secondary" disabled={savingUserId === user.membershipId || (passwordEdits[user.membershipId]?.length ?? 0) < 8} onClick={() => void resetPassword(user.membershipId)}>Redefinir senha</button></div></details>}
        </section>;
      })()}
      {tab === "roles" && (showCreateRole || currentRole) && <section className={styles.editor}><div className={styles.editorHead}><div><h3>{showCreateRole ? "Novo perfil" : currentRole!.name}</h3><p>{currentRole?.systemTemplate && !showCreateRole ? "Perfil protegido do sistema. As permissões são somente para consulta." : "Escolha as áreas e permissões que fazem parte deste perfil."}</p></div><button type="button" className={styles.close} aria-label="Fechar edição do perfil" onClick={() => { setShowCreateRole(false); setSelectedRole(null); }}><X /></button></div>
        <form onSubmit={event => { if (showCreateRole) void createRole(event); else { event.preventDefault(); void saveRolePermissions(currentRole!.id); } }}>
          {showCreateRole && <label className={styles.reason}>Nome do perfil<input required minLength={2} maxLength={60} value={roleName} onChange={event => setRoleName(event.target.value)} placeholder="Ex.: Atendente de salão" /></label>}
          <PermissionPicker key={showCreateRole ? "new" : currentRole!.id} permissions={permissions} selected={showCreateRole ? rolePermissions : roleEdits[currentRole!.id] ?? []} disabled={!showCreateRole && currentRole!.systemTemplate} onChange={next => showCreateRole ? setRolePermissions(next) : setRoleEdits(current => ({ ...current, [currentRole!.id]: next }))} />
          {(showCreateRole || !currentRole!.systemTemplate) && <div className={styles.actions}><button type="submit" className="primary" disabled={savingRole || roleBusy || (showCreateRole && (!roleName.trim() || !rolePermissions.length))}>{savingRole || roleBusy ? "Salvando…" : showCreateRole ? "Criar perfil" : "Salvar permissões"}</button>{!showCreateRole && <button type="button" className="secondary" disabled={roleBusy} onClick={() => { if (window.confirm(currentRole!.active ? "Desativar este perfil? Os usuários deixam de receber as permissões dele." : "Reativar este perfil?")) void toggleRoleActive(currentRole!); }}>{currentRole!.active ? "Desativar perfil" : "Ativar perfil"}</button>}</div>}
        </form>
      </section>}
      {tab === "users" ? <div className={styles.list}>
        <div className={styles.listHeading}><span>USUÁRIO</span><span>ACESSOS</span><span>SITUAÇÃO</span><span /></div>
        {filteredUsers.map(user => <article className={styles.userRow} key={user.membershipId}><div className={styles.identity}><div className={styles.avatar}>{user.name.slice(0, 1).toUpperCase()}</div><div><strong>{user.name}{user.isSelf && <small> · Você</small>}</strong><span>@{user.username}</span><span>{user.email ?? user.pendingEmail ?? "E-mail não cadastrado"}</span></div></div><div className={styles.rowAccess}><strong>{roleNames(user.roleIds)}</strong><span>{unitNames(user.establishmentIds)}</span></div><div className={styles.rowStatus}><span className={user.status === "ACTIVE" && user.userActive ? styles.active : styles.inactive}>{!user.userActive ? "Inativo" : user.status === "SUSPENDED" ? "Suspenso" : user.status === "INVITED" ? "Convidado" : "Ativo"}</span><small>{emailStatus(user)}</small></div><button type="button" className={styles.editButton} aria-label={`Gerenciar ${user.name}`} onClick={() => { setSelectedUser(user.membershipId); setShowCreateUser(false); setError(""); }}>Gerenciar<ChevronRight size={16} /></button></article>)}
        {!filteredUsers.length && <p className={styles.empty}>{query || statusFilter !== "all" ? "Nenhum usuário encontrado para este filtro." : "Nenhum usuário cadastrado."}</p>}
      </div> : <div className={styles.roleList}>{filteredRoles.map(role => <article className={styles.roleRow} key={role.id}><div className={styles.roleIcon}><ShieldCheck size={22} /></div><div><strong>{role.name}</strong><p>{role.systemTemplate ? "Acesso integral · protegido pelo sistema" : `${role.permissionKeys.length} permissões · ${users.filter(user => user.roleIds.includes(role.id)).length} usuários vinculados`}</p></div><span className={role.active ? styles.active : styles.inactive}>{role.active ? "Ativo" : "Inativo"}</span><button type="button" className={styles.editButton} aria-label={`${role.systemTemplate ? "Consultar" : "Editar"} perfil ${role.name}`} onClick={() => { setSelectedRole(role.id); setShowCreateRole(false); setError(""); }}>{role.systemTemplate ? "Consultar" : "Editar"}<ChevronRight size={16} /></button></article>)}{!filteredRoles.length && <p className={styles.empty}>Nenhum perfil encontrado.</p>}</div>}
    </>}
  </section>;
}
