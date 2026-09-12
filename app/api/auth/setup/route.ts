import { createSession, isSameOrigin, normalizeUsername } from "@/lib/auth";
import { setupSchema, slugify } from "@/lib/auth-validation";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { OWNER_PERMISSIONS, OWNER_ROLE_NAME } from "@/lib/permissions";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const parsed = setupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  if (await db.user.count() > 0) return Response.json({ error: "A configuração inicial já foi concluída." }, { status: 409 });

  const data = parsed.data;
  const passwordHash = await hashPassword(data.password);
  try {
    const result = await db.$transaction(async (tx) => {
      if (await tx.user.count() > 0) throw new Error("SETUP_ALREADY_DONE");
      const user = await tx.user.create({ data: { name: data.ownerName, username: normalizeUsername(data.username), passwordHash } });
      const organization = await tx.organization.create({ data: { name: data.organizationName, slug: slugify(data.organizationName) } });
      const establishment = await tx.establishment.create({ data: { organizationId: organization.id, name: data.establishmentName, slug: slugify(data.establishmentName), diningTables: { create: Array.from({ length: 12 }, (_, index) => ({ number: index + 1, seats: 4 })) } } });
      const membership = await tx.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, status: "ACTIVE" } });
      await tx.establishmentAccess.create({ data: { membershipId: membership.id, establishmentId: establishment.id } });
      const permissions = [];
      for (const key of OWNER_PERMISSIONS) {
        permissions.push(await tx.permission.upsert({
          where: { key },
          update: { module: key.split(".")[0], description: `Gerenciar ${key.split(".")[0]} da organização` },
          create: { key, module: key.split(".")[0], description: `Gerenciar ${key.split(".")[0]} da organização` },
        }));
      }
      const ownerRole = await tx.customRole.create({
        data: {
          organizationId: organization.id,
          name: OWNER_ROLE_NAME,
          description: "Responsável principal pela organização",
          systemTemplate: true,
          permissions: { create: permissions.map(permission => ({ permissionId: permission.id })) },
        },
      });
      await tx.membershipRole.create({ data: { membershipId: membership.id, roleId: ownerRole.id } });
      await tx.auditEvent.create({ data: { organizationId: organization.id, establishmentId: establishment.id, actorId: user.id, action: "CREATE", entityType: "Organization", entityId: organization.id, reason: "Configuração inicial do sistema" } });
      return user;
    });
    await createSession(result.id, request);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "SETUP_ALREADY_DONE") return Response.json({ error: "A configuração inicial já foi concluída." }, { status: 409 });
    return Response.json({ error: "Não foi possível concluir a configuração inicial." }, { status: 500 });
  }
}
