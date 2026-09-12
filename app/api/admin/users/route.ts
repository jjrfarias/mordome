import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin, normalizeUsername } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { usernameSchema, passwordSchema } from "@/lib/auth-validation";
import { hashPassword } from "@/lib/password";
import { ESTABLISHMENTS_MANAGE } from "@/lib/permissions";
import { createLocalUser, listLocalRoles, listLocalUsers, localPermissionCatalog, updateLocalUser } from "@/lib/local-access-control";
import { listLocalEstablishments } from "@/lib/local-auth";
import { recordLocalAudit } from "@/lib/local-audit";
import { requestAuditMetadata } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  username: usernameSchema,
  password: passwordSchema,
  establishmentIds: z.array(z.string().min(1)).min(1),
  roleIds: z.array(z.string().min(1)).default([]),
});

const overrideSchema = z.object({ permissionKey: z.string().min(1), effect: z.enum(["ALLOW", "DENY"]) });

const updateSchema = z.object({
  membershipId: z.string().min(1),
  active: z.boolean().optional(),
  status: z.enum(MembershipStatus).optional(),
  establishmentIds: z.array(z.string().min(1)).optional(),
  roleIds: z.array(z.string().min(1)).optional(),
  password: passwordSchema.optional(),
  overrides: z.array(overrideSchema).max(100).optional(),
  overrideReason: z.string().trim().min(3).max(200).optional(),
}).refine(value => value.active !== undefined || value.status !== undefined || value.establishmentIds !== undefined || value.roleIds !== undefined || value.password !== undefined || value.overrides !== undefined, {
  message: "Informe ao menos um campo para atualizar.",
}).refine(value => !value.overrides || new Set(value.overrides.map(item => item.permissionKey)).size === value.overrides.length, {
  message: "Uma permissão não pode possuir duas exceções.",
}).refine(value => value.overrides === undefined || value.overrides.length === 0 || Boolean(value.overrideReason), {
  message: "Informe a justificativa das exceções.",
});

async function resolveActor() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!session.canViewUsers) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? { session, membershipId: membership.id } : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const localSession = await getLocalSession();
    return localSession?.canViewUsers ? Response.json({ users: listLocalUsers().map(user => ({ ...user, isSelf: user.userId === localSession.user.id })), establishments: listLocalEstablishments() }) : Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const [memberships, establishments] = await Promise.all([db.organizationMembership.findMany({
    where: { organizationId: actor.session.organization.id },
    include: { user: { select: { id: true, name: true, username: true, active: true } }, accesses: { select: { establishmentId: true } }, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, overrides: { include: { permission: true } } },
    orderBy: { createdAt: "asc" },
  }), db.establishment.findMany({ where: { organizationId: actor.session.organization.id }, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } })]);
  return Response.json({
    establishments,
    users: memberships.map(membership => ({
      membershipId: membership.id,
      userId: membership.user.id,
      name: membership.user.name,
      username: membership.user.username,
      userActive: membership.user.active,
      status: membership.status,
      establishmentIds: membership.accesses.map(access => access.establishmentId),
      roleIds: membership.roles.map(link => link.roleId),
      overrides: membership.overrides.map(item => ({ permissionKey: item.permission.key, effect: item.effect, reason: item.reason })),
      effectivePermissionKeys: [...new Set([
        ...membership.roles.filter(link => link.role.active).flatMap(link => link.role.permissions.map(item => item.permission.key)),
        ...membership.overrides.filter(item => item.effect === "ALLOW").map(item => item.permission.key),
      ])].filter(key => !membership.overrides.some(item => item.effect === "DENY" && item.permission.key === key)),
      isSelf: membership.id === actor.membershipId,
    })),
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const localSession = await getLocalSession();
    if (!localSession?.canCreateUsers) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const localParsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!localParsed.success) return Response.json({ error: localParsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    const establishments = listLocalEstablishments(); const roles = listLocalRoles();
    if (localParsed.data.establishmentIds.some(id => !establishments.some(item => item.id === id)) || localParsed.data.roleIds.some(id => !roles.some(item => item.id === id && item.active))) return Response.json({ error: "Acesso selecionado é inválido." }, { status: 400 });
    const grantedRoles = roles.filter(role => localParsed.data.roleIds.includes(role.id));
    if (!localSession.isOwner && (grantedRoles.some(role => role.systemTemplate) || grantedRoles.some(role => role.permissionKeys.some(key => !localSession.permissionKeys.includes(key))))) return Response.json({ error: "Você não pode conceder um perfil com permissões que não possui." }, { status: 403 });
    const user = createLocalUser({ ...localParsed.data, username: normalizeUsername(localParsed.data.username) });
    if (!user) return Response.json({ error: "Já existe um usuário com esse nome de usuário." }, { status: 409 });
    recordLocalAudit({ organizationId: localSession.organization.id, establishmentId: null, actorId: localSession.user.id, actorName: localSession.user.name, actorUsername: localSession.user.username, action: "CREATE", entityType: "User", entityId: user.userId, reason: `Usuário "${user.name}" criado`, after: { ...user, password: undefined }, ...requestAuditMetadata(request) });
    return Response.json({ user }, { status: 201 });
  }
  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });
  if (!actor.session.canCreateUsers) return Response.json({ error: "Você não tem permissão para criar usuários." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  const [establishments, roles] = await Promise.all([
    db.establishment.findMany({ where: { id: { in: data.establishmentIds }, organizationId: actor.session.organization.id } }),
    data.roleIds.length ? db.customRole.findMany({ where: { id: { in: data.roleIds }, organizationId: actor.session.organization.id, active: true }, include: { permissions: { include: { permission: true } } } }) : Promise.resolve([]),
  ]);
  if (establishments.length !== data.establishmentIds.length) return Response.json({ error: "Estabelecimento inválido na seleção." }, { status: 400 });
  if (roles.length !== data.roleIds.length) return Response.json({ error: "Perfil inválido na seleção." }, { status: 400 });
  if (!actor.session.isOwner && roles.some(role => role.permissions.some(link => !actor.session.permissionKeys.includes(link.permission.key)))) return Response.json({ error: "Você não pode conceder uma permissão que não possui." }, { status: 403 });

  try {
    const passwordHash = await hashPassword(data.password);
    const membership = await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { name: data.name, username: normalizeUsername(data.username), passwordHash } });
      const created = await tx.organizationMembership.create({ data: { organizationId: actor.session.organization.id, userId: user.id, status: "ACTIVE", accesses: { create: data.establishmentIds.map(establishmentId => ({ establishmentId })) }, roles: { create: data.roleIds.map(roleId => ({ roleId })) } } });
      await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, actorId: actor.session.user.id, action: "CREATE", entityType: "User", entityId: user.id, reason: `Usuário "${user.name}" criado`, after: { name: user.name, username: user.username, establishmentIds: data.establishmentIds, roleIds: data.roleIds } } });
      return { ...created, user };
    });
    return Response.json({ user: { membershipId: membership.id, userId: membership.user.id, name: membership.user.name, username: membership.user.username, userActive: true, status: membership.status, establishmentIds: data.establishmentIds, roleIds: data.roleIds, isSelf: false } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um usuário com esse nome de usuário." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar o usuário." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const localSession = await getLocalSession();
    if (!localSession) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const localParsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!localParsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
    const target = listLocalUsers().find(user => user.membershipId === localParsed.data.membershipId);
    if (target?.userId === localSession.user.id && localParsed.data.status === "SUSPENDED") return Response.json({ error: "Você não pode suspender seu próprio acesso." }, { status: 403 });
    const removesOwner = target?.roleIds.includes("role-owner") && (localParsed.data.status === "SUSPENDED" || (localParsed.data.roleIds !== undefined && !localParsed.data.roleIds.includes("role-owner")));
    if (removesOwner && target && !listLocalUsers().some(user => user.membershipId !== target.membershipId && user.status === "ACTIVE" && user.roleIds.includes("role-owner"))) return Response.json({ error: "A organização precisa manter pelo menos um proprietário ativo." }, { status: 409 });
    if (localParsed.data.status !== undefined && !localSession.canDisableUsers) return Response.json({ error: "Acesso negado." }, { status: 403 });
    if ((localParsed.data.establishmentIds !== undefined || localParsed.data.roleIds !== undefined) && !localSession.canManageRoles) return Response.json({ error: "Acesso negado." }, { status: 403 });
    if (localParsed.data.password !== undefined && !localSession.canResetUserPassword) return Response.json({ error: "Acesso negado." }, { status: 403 });
    if (localParsed.data.overrides !== undefined && !localSession.canManageRoles) return Response.json({ error: "Acesso negado." }, { status: 403 });
    if (localParsed.data.overrides?.some(item => !localPermissionCatalog.some(permission => permission.key === item.permissionKey))) return Response.json({ error: "Permissão inválida na seleção." }, { status: 400 });
    if (!localSession.isOwner && localParsed.data.overrides?.some(item => !localSession.permissionKeys.includes(item.permissionKey))) return Response.json({ error: "Você não pode criar exceções para permissões que não possui." }, { status: 403 });
    if (target?.roleIds.includes("role-owner") && localParsed.data.overrides?.length) return Response.json({ error: "O perfil Proprietário não recebe exceções individuais." }, { status: 403 });
    const before = target;
    const localOverrides = localParsed.data.overrides?.map(item => ({ ...item, reason: localParsed.data.overrideReason ?? "Exceções removidas" }));
    const user = updateLocalUser(localParsed.data.membershipId, { status: localParsed.data.status, establishmentIds: localParsed.data.establishmentIds, roleIds: localParsed.data.roleIds, overrides: localOverrides, password: localParsed.data.password });
    if (!user) return Response.json({ error: "Esse acesso não pode ser alterado." }, { status: 403 });
    recordLocalAudit({ organizationId: localSession.organization.id, establishmentId: null, actorId: localSession.user.id, actorName: localSession.user.name, actorUsername: localSession.user.username, action: localParsed.data.roleIds !== undefined || localParsed.data.establishmentIds !== undefined || localParsed.data.overrides !== undefined ? "PERMISSION_CHANGE" : "UPDATE", entityType: "User", entityId: user.userId, reason: localParsed.data.password ? `Senha de "${user.name}" redefinida` : `Usuário "${user.name}" atualizado`, before, after: { ...user, passwordReset: localParsed.data.password !== undefined }, ...requestAuditMetadata(request) });
    return Response.json({ user });
  }
  const actor = await resolveActor();
  if (!actor) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;
  if (data.status !== undefined && !actor.session.canDisableUsers) return Response.json({ error: "Você não tem permissão para suspender usuários." }, { status: 403 });
  if ((data.establishmentIds !== undefined || data.roleIds !== undefined) && !actor.session.canManageRoles) return Response.json({ error: "Você não tem permissão para alterar acessos." }, { status: 403 });
  if (data.password !== undefined && !actor.session.canResetUserPassword) return Response.json({ error: "Você não tem permissão para redefinir senhas." }, { status: 403 });
  if (data.overrides !== undefined && !actor.session.canManageRoles) return Response.json({ error: "Você não tem permissão para alterar exceções individuais." }, { status: 403 });

  const current = await db.organizationMembership.findFirst({ where: { id: data.membershipId, organizationId: actor.session.organization.id }, include: { user: true, roles: { include: { role: true } }, overrides: { include: { permission: true } } } });
  if (!current) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });

  const isSelf = current.id === actor.membershipId;
  if (isSelf && (data.active === false || data.status === "SUSPENDED")) return Response.json({ error: "Você não pode desativar seu próprio acesso." }, { status: 403 });
  if (isSelf && data.roleIds !== undefined && !data.roleIds.length) return Response.json({ error: "Você não pode remover todos os seus próprios perfis." }, { status: 403 });

  const currentlyOwner = current.roles.some(link => link.role.systemTemplate && link.role.active);
  if (currentlyOwner && data.overrides?.length) return Response.json({ error: "O perfil Proprietário não recebe exceções individuais." }, { status: 403 });
  const removesOwner = data.status === "SUSPENDED" || (data.roleIds !== undefined && !data.roleIds.includes(current.roles.find(link => link.role.systemTemplate)?.roleId ?? ""));
  if (currentlyOwner && removesOwner) {
    const otherOwners = await db.organizationMembership.count({ where: { organizationId: actor.session.organization.id, status: "ACTIVE", id: { not: current.id }, roles: { some: { role: { systemTemplate: true, active: true } } } } });
    if (otherOwners === 0) return Response.json({ error: "A organização precisa manter pelo menos um proprietário ativo." }, { status: 409 });
  }

  if (data.establishmentIds !== undefined) {
    const establishments = await db.establishment.findMany({ where: { id: { in: data.establishmentIds }, organizationId: actor.session.organization.id } });
    if (establishments.length !== data.establishmentIds.length) return Response.json({ error: "Estabelecimento inválido na seleção." }, { status: 400 });
    if (isSelf && !data.establishmentIds.length) return Response.json({ error: "Você não pode remover o acesso a todas as unidades." }, { status: 403 });
  }
  if (data.roleIds !== undefined) {
    const roles = await db.customRole.findMany({ where: { id: { in: data.roleIds }, organizationId: actor.session.organization.id, active: true }, include: { permissions: { include: { permission: true } } } });
    if (roles.length !== data.roleIds.length) return Response.json({ error: "Perfil inválido na seleção." }, { status: 400 });
    if (!actor.session.isOwner && (roles.some(role => role.systemTemplate) || roles.some(role => role.permissions.some(link => !actor.session.permissionKeys.includes(link.permission.key))))) return Response.json({ error: "Você não pode conceder um perfil com permissões que não possui." }, { status: 403 });
    if (isSelf) {
      const keepsEstablishmentsManage = roles.some(role => role.active && role.permissions.some(link => link.permission.key === ESTABLISHMENTS_MANAGE));
      if (!keepsEstablishmentsManage) return Response.json({ error: "Você não pode remover o perfil que concede acesso a esta administração." }, { status: 403 });
    }
  }

  let overridePermissions: { id: string; key: string }[] | undefined;
  if (data.overrides !== undefined) {
    overridePermissions = await db.permission.findMany({ where: { key: { in: data.overrides.map(item => item.permissionKey) } }, select: { id: true, key: true } });
    if (overridePermissions.length !== data.overrides.length) return Response.json({ error: "Permissão inválida na seleção." }, { status: 400 });
    if (!actor.session.isOwner && data.overrides.some(item => !actor.session.permissionKeys.includes(item.permissionKey))) return Response.json({ error: "Você não pode criar exceções para permissões que não possui." }, { status: 403 });
  }

  try {
    const membership = await db.$transaction(async tx => {
      if (data.password !== undefined) {
        await tx.user.update({ where: { id: current.userId }, data: { passwordHash: await hashPassword(data.password) } });
        await tx.session.deleteMany({ where: { userId: current.userId } });
      }
      if (data.active !== undefined) await tx.user.update({ where: { id: current.userId }, data: { active: data.active } });
      const updated = await tx.organizationMembership.update({ where: { id: current.id }, data: { status: data.status } });
      if (data.establishmentIds !== undefined) {
        await tx.establishmentAccess.deleteMany({ where: { membershipId: current.id } });
        await tx.establishmentAccess.createMany({ data: data.establishmentIds.map(establishmentId => ({ membershipId: current.id, establishmentId })) });
      }
      if (data.roleIds !== undefined) {
        await tx.membershipRole.deleteMany({ where: { membershipId: current.id } });
        await tx.membershipRole.createMany({ data: data.roleIds.map(roleId => ({ membershipId: current.id, roleId })) });
      }
      if (data.overrides !== undefined && overridePermissions) {
        await tx.userPermissionOverride.deleteMany({ where: { membershipId: current.id } });
        await tx.userPermissionOverride.createMany({ data: data.overrides.map(item => ({ organizationId: actor.session.organization.id, membershipId: current.id, permissionId: overridePermissions.find(permission => permission.key === item.permissionKey)!.id, effect: item.effect, reason: data.overrideReason ?? "Exceções removidas" })) });
      }
      await tx.auditEvent.create({ data: { organizationId: actor.session.organization.id, actorId: actor.session.user.id, action: data.roleIds !== undefined || data.establishmentIds !== undefined || data.overrides !== undefined ? "PERMISSION_CHANGE" : "UPDATE", entityType: "User", entityId: current.userId, reason: data.password !== undefined ? `Senha de "${current.user.name}" redefinida` : `Usuário "${current.user.name}" atualizado`, before: { status: current.status, active: current.user.active, roleIds: current.roles.map(link => link.roleId), overrides: current.overrides.map(item => ({ permissionKey: item.permission.key, effect: item.effect })) }, after: { status: updated.status, active: data.active, establishmentIds: data.establishmentIds, roleIds: data.roleIds, overrides: data.overrides, passwordReset: data.password !== undefined } } });
      return updated;
    });
    const [accesses, roleLinks] = await Promise.all([
      db.establishmentAccess.findMany({ where: { membershipId: membership.id } }),
      db.membershipRole.findMany({ where: { membershipId: membership.id } }),
    ]);
    return Response.json({ user: { membershipId: membership.id, userId: current.userId, name: current.user.name, username: current.user.username, userActive: data.active ?? current.user.active, status: membership.status, establishmentIds: accesses.map(access => access.establishmentId), roleIds: roleLinks.map(link => link.roleId), isSelf } });
  } catch {
    return Response.json({ error: "Não foi possível atualizar o usuário." }, { status: 500 });
  }
}
