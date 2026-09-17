import { randomUUID } from "node:crypto";

export type LocalCustomer = { id: string; organizationId: string; name: string; phone: string; email: string | null; document: string | null; notes: string | null; active: boolean; createdAt: string };

const customersByOrg = new Map<string, LocalCustomer[]>();

function bucket(organizationId: string) {
  if (!customersByOrg.has(organizationId)) customersByOrg.set(organizationId, []);
  return customersByOrg.get(organizationId)!;
}

// Telefone é o identificador do cliente (ADR 0047) — normalizado para dígitos apenas, para que
// "(21) 99999-0000" e "21999990000" sejam reconhecidos como o mesmo número.
export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function listLocalCustomers(organizationId: string, search?: string) {
  const list = bucket(organizationId);
  const term = search?.trim().toLocaleLowerCase("pt-BR");
  const termDigits = term ? normalizePhone(term) : "";
  const filtered = term ? list.filter(customer => customer.name.toLocaleLowerCase("pt-BR").includes(term) || (termDigits.length > 0 && normalizePhone(customer.phone).includes(termDigits))) : list;
  return filtered.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map(customer => ({ ...customer }));
}

export function findLocalCustomerByPhone(organizationId: string, phone: string) {
  const normalized = normalizePhone(phone);
  return bucket(organizationId).find(customer => normalizePhone(customer.phone) === normalized) ?? null;
}

export function createLocalCustomer(organizationId: string, data: { name: string; phone: string; email?: string | null; document?: string | null; notes?: string | null }) {
  if (findLocalCustomerByPhone(organizationId, data.phone)) return "DUPLICATE_PHONE" as const;
  const customer: LocalCustomer = { id: `local-customer-${randomUUID()}`, organizationId, name: data.name, phone: normalizePhone(data.phone), email: data.email ?? null, document: data.document ?? null, notes: data.notes ?? null, active: true, createdAt: new Date().toISOString() };
  bucket(organizationId).push(customer);
  return customer;
}

export function updateLocalCustomer(organizationId: string, customerId: string, data: { name?: string; phone?: string; email?: string | null; document?: string | null; notes?: string | null; active?: boolean }) {
  const customer = bucket(organizationId).find(item => item.id === customerId);
  if (!customer) return "NOT_FOUND" as const;
  if (data.phone && normalizePhone(data.phone) !== normalizePhone(customer.phone) && findLocalCustomerByPhone(organizationId, data.phone)) return "DUPLICATE_PHONE" as const;
  const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  if (defined.phone) defined.phone = normalizePhone(defined.phone as string);
  Object.assign(customer, defined);
  return { ...customer };
}

// Reconhecimento automático de cliente repetido (ADR 0047): chamado ao criar um pedido de
// delivery — encontra pelo telefone ou cadastra na hora, sem exigir um passo manual de cadastro
// antes. Atualiza o nome se o cliente informou um nome diferente desta vez (mesmo telefone),
// mantendo o cadastro coerente com o uso mais recente.
export function findOrCreateLocalCustomerByPhone(organizationId: string, data: { name: string; phone: string }) {
  const existing = findLocalCustomerByPhone(organizationId, data.phone);
  if (existing) { existing.name = data.name; return existing; }
  const created = createLocalCustomer(organizationId, data);
  return created === "DUPLICATE_PHONE" ? findLocalCustomerByPhone(organizationId, data.phone)! : created;
}
