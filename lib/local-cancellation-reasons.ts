import { randomUUID } from "node:crypto";

// Motivos pré-definidos de cancelamento/reembolso (ver ADR 0029) — escopo por organização,
// já que motivos tendem a ser os mesmos em todas as unidades de uma rede.
export type CancellationReasonCategory = "SALE_CANCEL" | "ITEM_CANCEL" | "REFUND";
type LocalCancellationReason = { id: string; organizationId: string; category: CancellationReasonCategory; label: string; active: boolean; createdAt: string };

const reasonsByOrganization = new Map<string, LocalCancellationReason[]>();

function bucket(organizationId: string) {
  if (!reasonsByOrganization.has(organizationId)) reasonsByOrganization.set(organizationId, []);
  return reasonsByOrganization.get(organizationId)!;
}
const sameLabel = (a: string, b: string) => a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");

export function listLocalCancellationReasons(organizationId: string, category?: CancellationReasonCategory) {
  return bucket(organizationId)
    .filter(item => !category || item.category === category)
    .map(item => ({ ...item }));
}

export function createLocalCancellationReason(organizationId: string, data: { category: CancellationReasonCategory; label: string }) {
  const list = bucket(organizationId);
  if (list.some(item => item.category === data.category && sameLabel(item.label, data.label))) return "DUPLICATE" as const;
  const reason: LocalCancellationReason = { id: `local-cancellation-reason-${randomUUID()}`, organizationId, category: data.category, label: data.label, active: true, createdAt: new Date().toISOString() };
  list.push(reason);
  return { ...reason };
}

export function updateLocalCancellationReason(organizationId: string, reasonId: string, data: { label?: string; active?: boolean }) {
  const list = bucket(organizationId);
  const reason = list.find(item => item.id === reasonId);
  if (!reason) return "NOT_FOUND" as const;
  if (data.label && list.some(item => item.id !== reasonId && item.category === reason.category && sameLabel(item.label, data.label!))) return "DUPLICATE" as const;
  if (data.label !== undefined) reason.label = data.label;
  if (data.active !== undefined) reason.active = data.active;
  return { ...reason };
}
