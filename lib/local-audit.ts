import { randomUUID } from "node:crypto";

export type LocalAuditEvent = {
  id: string;
  organizationId: string;
  establishmentId: string | null;
  establishmentName?: string | null;
  actorId: string;
  actorName: string;
  actorUsername: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

const events: LocalAuditEvent[] = [];

export function recordLocalAudit(input: Omit<LocalAuditEvent, "id" | "createdAt">) {
  const event: LocalAuditEvent = { ...input, id: `local-audit-${randomUUID()}`, createdAt: new Date().toISOString() };
  events.push(event);
  return event;
}

export function listLocalAudit(input: { organizationId: string; establishmentId?: string; action?: string; query?: string; limit: number }) {
  const query = input.query?.trim().toLocaleLowerCase("pt-BR");
  return events
    .filter(event => event.organizationId === input.organizationId)
    .filter(event => !input.establishmentId || event.establishmentId === input.establishmentId)
    .filter(event => !input.action || event.action === input.action)
    .filter(event => !query || [event.actorName, event.actorUsername, event.entityType, event.entityId, event.reason, event.action].some(value => value?.toLocaleLowerCase("pt-BR").includes(query)))
    .slice(-input.limit)
    .reverse();
}
