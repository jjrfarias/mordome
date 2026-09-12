export type PermissionEffect = "ALLOW" | "DENY";

export type PermissionContext = {
  organizationId: string;
  allowedEstablishmentIds: ReadonlySet<string>;
  rolePermissions: ReadonlySet<string>;
  overrides: ReadonlyMap<string, PermissionEffect>;
};

export function canAccessEstablishment(context: PermissionContext, organizationId: string, establishmentId: string) {
  return context.organizationId === organizationId && context.allowedEstablishmentIds.has(establishmentId);
}

export function hasPermission(context: PermissionContext, permission: string) {
  const override = context.overrides.get(permission);
  if (override === "DENY") return false;
  if (override === "ALLOW") return true;
  return context.rolePermissions.has(permission);
}

export function authorize(context: PermissionContext, input: { organizationId: string; establishmentId: string; permission: string }) {
  return canAccessEstablishment(context, input.organizationId, input.establishmentId) && hasPermission(context, input.permission);
}
