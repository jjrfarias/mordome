import { Prisma } from "@/generated/prisma/client";
import { isSameOrigin, normalizeUsername } from "@/lib/auth";
import { slugify } from "@/lib/auth-validation";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { OWNER_PERMISSIONS, OWNER_ROLE_NAME } from "@/lib/permissions";
import { getSystemAdminSession, systemRequestMetadata } from "@/lib/system-auth";
import { createTenantSchema, updateTenantStatusSchema } from "@/lib/system-validation";

async function requireAdmin() { return getSystemAdminSession(); }

export async function GET() {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const organizations = await db.organization.findMany({
    include: { _count: { select: { establishments: true, memberships: true } } },
    orderBy: { createdAt: "desc" },
  });
  const tenants = await Promise.all(organizations.map(async organization => {
    const establishmentIds = (await db.establishment.findMany({ where: { organizationId: organization.id }, select: { id: true } })).map(item => item.id);
    const [sales, deliveryOrders, openTabs, sessions] = await Promise.all([
      db.sale.aggregate({ where: { organizationId: organization.id, completedAt: { gte: monthStart } }, _count: true, _sum: { total: true } }),
      db.deliveryOrder.count({ where: { establishmentId: { in: establishmentIds }, createdAt: { gte: monthStart } } }),
      db.tab.count({ where: { establishmentId: { in: establishmentIds }, status: "OPEN" } }),
      db.session.count({ where: { expiresAt: { gt: new Date() }, user: { memberships: { some: { organizationId: organization.id, status: "ACTIVE" } } } } }),
    ]);
    return {
      id: organization.id, name: organization.name, slug: organization.slug, active: organization.active,
      createdAt: organization.createdAt, establishments: organization._count.establishments,
      users: organization._count.memberships, activeSessions: sessions, salesThisMonth: sales._count,
      revenueThisMonth: Number(sales._sum.total ?? 0), deliveryOrdersThisMonth: deliveryOrders, openTabs,
    };
  }));
  return Response.json({ tenants, generatedAt: new Date().toISOString() });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = createTenantSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const data = parsed.data;
  const baseSlug = slugify(data.organizationName);
  let slug = baseSlug;
  for (let suffix = 2; await db.organization.findUnique({ where: { slug } }); suffix += 1) slug = `${baseSlug}-${suffix}`;
  try {
    const passwordHash = await hashPassword(data.ownerPassword);
    const result = await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { name: data.ownerName, username: normalizeUsername(data.ownerUsername), passwordHash } });
      const organization = await tx.organization.create({ data: { name: data.organizationName, slug } });
      const establishment = await tx.establishment.create({ data: { organizationId: organization.id, name: data.establishmentName, slug: slugify(data.establishmentName), diningTables: { create: Array.from({ length: 12 }, (_, index) => ({ number: index + 1, seats: 4 })) } } });
      const membership = await tx.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, status: "ACTIVE", accesses: { create: { establishmentId: establishment.id } } } });
      const permissions = [];
      for (const key of OWNER_PERMISSIONS) permissions.push(await tx.permission.upsert({ where: { key }, update: {}, create: { key, module: key.split(".")[0], description: `Gerenciar ${key.split(".")[0]} da organização` } }));
      const role = await tx.customRole.create({ data: { organizationId: organization.id, name: OWNER_ROLE_NAME, description: "Responsável principal pela organização", systemTemplate: true, permissions: { create: permissions.map(permission => ({ permissionId: permission.id })) } } });
      await tx.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
      await tx.platformAuditEvent.create({ data: { adminId: admin.admin.id, action: "TENANT_CREATE", entityType: "Organization", entityId: organization.id, reason: "Tenant criado pelo painel do sistema", after: { name: organization.name, slug, ownerUsername: user.username, establishmentName: establishment.name }, ...systemRequestMetadata(request) } });
      return organization;
    });
    return Response.json({ tenant: { id: result.id, name: result.name, slug: result.slug, active: result.active } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "O usuário informado já existe." }, { status: 409 });
    return Response.json({ error: "Não foi possível criar o tenant." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const parsed = updateTenantStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const current = await db.organization.findUnique({ where: { id: parsed.data.organizationId } });
  if (!current) return Response.json({ error: "Tenant não encontrado." }, { status: 404 });
  const tenant = await db.$transaction(async tx => {
    const updated = await tx.organization.update({ where: { id: current.id }, data: { active: parsed.data.active } });
    if (!parsed.data.active) await tx.session.deleteMany({ where: { user: { memberships: { some: { organizationId: current.id } } } } });
    await tx.platformAuditEvent.create({ data: { adminId: admin.admin.id, action: parsed.data.active ? "TENANT_RELEASE" : "TENANT_BLOCK", entityType: "Organization", entityId: current.id, reason: parsed.data.reason, before: { active: current.active }, after: { active: updated.active }, ...systemRequestMetadata(request) } });
    return updated;
  });
  return Response.json({ tenant: { id: tenant.id, active: tenant.active } });
}
