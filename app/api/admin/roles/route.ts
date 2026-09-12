import { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, isSameOrigin } from "@/lib/auth";
import { getLocalSession, isLocalAuthEnabled } from "@/lib/local-auth";
import { createLocalRole, listLocalRoles, localPermissionCatalog, updateLocalRole } from "@/lib/local-access-control";
import { recordLocalAudit } from "@/lib/local-audit";
import { requestAuditMetadata } from "@/lib/audit";

const createSchema = z.object({ name: z.string().trim().min(2).max(60), permissionKeys: z.array(z.string()).min(1) });
const updateSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  active: z.boolean().optional(),
  permissionKeys: z.array(z.string()).optional(),
}).refine(value => value.name !== undefined || value.active !== undefined || value.permissionKeys !== undefined, {
  message: "Informe ao menos um campo para atualizar.",
});

async function resolveActor(readOnly = false) {
  const session = await getCurrentSession();
  if (!session) return null;
  if (readOnly ? !(session.canViewUsers || session.canManageRoles) : !session.canManageRoles) return null;
  const membership = await db.organizationMembership.findFirst({ where: { userId: session.user.id, organizationId: session.organization.id, status: MembershipStatus.ACTIVE } });
  return membership ? session : null;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const localSession = await getLocalSession();
    return localSession && (localSession.canViewUsers || localSession.canManageRoles) ? Response.json({ permissions: localPermissionCatalog, roles: listLocalRoles() }) : Response.json({ error: "Acesso negado." }, { status: 403 });
  }
  const session = await resolveActor(true);
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const [permissions, roles] = await Promise.all([
    db.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] }),
    db.customRole.findMany({ where: { organizationId: session.organization.id }, include: { permissions: { select: { permissionId: true } } }, orderBy: { name: "asc" } }),
  ]);
  return Response.json({
    permissions: permissions.map(p => ({ key: p.key, module: p.module, description: p.description })),
    roles: roles.map(role => ({ id: role.id, name: role.name, active: role.active, systemTemplate: role.systemTemplate, permissionKeys: permissions.filter(p => role.permissions.some(link => link.permissionId === p.id)).map(p => p.key) })),
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const localSession = await getLocalSession();
    if (!localSession?.canManageRoles) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const localParsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!localParsed.success || localParsed.data.permissionKeys.some(key => !localPermissionCatalog.some(permission => permission.key === key))) return Response.json({ error: "Dados inválidos." }, { status: 400 });
    if (!localSession.isOwner && localParsed.data.permissionKeys.some(key => !localSession.permissionKeys.includes(key))) return Response.json({ error: "Você não pode conceder uma permissão que não possui." }, { status: 403 });
    const role = createLocalRole(localParsed.data.name, localParsed.data.permissionKeys);
    if (!role) return Response.json({ error: "Já existe um perfil com esse nome." }, { status: 409 });
    recordLocalAudit({ organizationId: localSession.organization.id, establishmentId: null, actorId: localSession.user.id, actorName: localSession.user.name, actorUsername: localSession.user.username, action: "PERMISSION_CHANGE", entityType: "CustomRole", entityId: role.id, reason: `Perfil "${role.name}" criado`, after: role, ...requestAuditMetadata(request) });
    return Response.json({ role }, { status: 201 });
  }
  const session = await resolveActor();
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  const permissions = await db.permission.findMany({ where: { key: { in: parsed.data.permissionKeys } } });
  if (permissions.length !== parsed.data.permissionKeys.length) return Response.json({ error: "Permissão inválida na seleção." }, { status: 400 });
  if (!session.isOwner && parsed.data.permissionKeys.some(key => !session.permissionKeys.includes(key))) return Response.json({ error: "Você não pode conceder uma permissão que não possui." }, { status: 403 });

  try {
    const role = await db.$transaction(async tx => {
      const created = await tx.customRole.create({ data: { organizationId: session.organization.id, name: parsed.data.name, permissions: { create: permissions.map(permission => ({ permissionId: permission.id })) } } });
      await tx.auditEvent.create({ data: { organizationId: session.organization.id, actorId: session.user.id, action: "PERMISSION_CHANGE", entityType: "CustomRole", entityId: created.id, reason: `Perfil "${created.name}" criado`, after: { name: created.name, permissionKeys: parsed.data.permissionKeys } } });
      return created;
    });
    return Response.json({ role: { id: role.id, name: role.name, active: role.active, systemTemplate: role.systemTemplate, permissionKeys: parsed.data.permissionKeys } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um perfil com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar o perfil." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (isLocalAuthEnabled()) {
    const localSession = await getLocalSession();
    if (!localSession?.canManageRoles) return Response.json({ error: "Acesso negado." }, { status: 403 });
    const localParsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!localParsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
    if (!localSession.isOwner && localParsed.data.permissionKeys?.some(key => !localSession.permissionKeys.includes(key))) return Response.json({ error: "Você não pode conceder uma permissão que não possui." }, { status: 403 });
    const before = listLocalRoles().find(role => role.id === localParsed.data.roleId);
    const role = updateLocalRole(localParsed.data.roleId, { name: localParsed.data.name, active: localParsed.data.active, permissionKeys: localParsed.data.permissionKeys });
    if (!role) return Response.json({ error: "O perfil padrão não pode ser alterado." }, { status: 403 });
    recordLocalAudit({ organizationId: localSession.organization.id, establishmentId: null, actorId: localSession.user.id, actorName: localSession.user.name, actorUsername: localSession.user.username, action: "PERMISSION_CHANGE", entityType: "CustomRole", entityId: role.id, reason: `Perfil "${role.name}" atualizado`, before, after: role, ...requestAuditMetadata(request) });
    return Response.json({ role });
  }
  const session = await resolveActor();
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = parsed.data;

  const current = await db.customRole.findFirst({ where: { id: data.roleId, organizationId: session.organization.id } });
  if (!current) return Response.json({ error: "Perfil não encontrado." }, { status: 404 });
  if (current.systemTemplate && (data.active === false || data.permissionKeys !== undefined)) {
    return Response.json({ error: "O perfil Proprietário não pode ter permissões ou status alterados." }, { status: 403 });
  }

  let permissionRows: { id: string }[] | undefined;
  if (data.permissionKeys !== undefined) {
    permissionRows = await db.permission.findMany({ where: { key: { in: data.permissionKeys } } });
    if (permissionRows.length !== data.permissionKeys.length) return Response.json({ error: "Permissão inválida na seleção." }, { status: 400 });
    if (!session.isOwner && data.permissionKeys.some(key => !session.permissionKeys.includes(key))) return Response.json({ error: "Você não pode conceder uma permissão que não possui." }, { status: 403 });
  }

  try {
    const role = await db.$transaction(async tx => {
      const updated = await tx.customRole.update({ where: { id: current.id }, data: { name: data.name, active: data.active } });
      if (permissionRows) {
        await tx.rolePermission.deleteMany({ where: { roleId: current.id } });
        await tx.rolePermission.createMany({ data: permissionRows.map(permission => ({ roleId: current.id, permissionId: permission.id })) });
      }
      await tx.auditEvent.create({ data: { organizationId: session.organization.id, actorId: session.user.id, action: "PERMISSION_CHANGE", entityType: "CustomRole", entityId: current.id, reason: `Perfil "${updated.name}" atualizado`, before: { name: current.name, active: current.active }, after: { name: updated.name, active: updated.active, permissionKeys: data.permissionKeys } } });
      return updated;
    });
    const keys = data.permissionKeys ?? (await db.rolePermission.findMany({ where: { roleId: role.id }, include: { permission: true } })).map(link => link.permission.key);
    return Response.json({ role: { id: role.id, name: role.name, active: role.active, systemTemplate: role.systemTemplate, permissionKeys: keys } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Já existe um perfil com esse nome." }, { status: 409 });
    return Response.json({ error: "Não foi possível atualizar o perfil." }, { status: 500 });
  }
}
