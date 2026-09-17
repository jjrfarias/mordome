import { randomUUID } from "node:crypto";

export type LocalFiscalTaxRegime = "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
export type LocalFiscalEnvironment = "HOMOLOGACAO" | "PRODUCAO";
export type LocalFiscalDocumentStatus = "PENDING" | "AUTHORIZED" | "REJECTED" | "CANCELLED" | "ERROR";

export type LocalFiscalConfig = { establishmentId: string; active: boolean; provider: "FOCUS_NFE"; providerApiToken: string | null; environment: LocalFiscalEnvironment; stateRegistration: string | null; taxRegime: LocalFiscalTaxRegime | null; printDanfe: boolean };
export type LocalFiscalDocument = { id: string; establishmentId: string; saleId: string; status: LocalFiscalDocumentStatus; environment: LocalFiscalEnvironment; accessKey: string | null; number: string | null; series: string | null; statusMessage: string | null; danfeUrl: string | null; qrCodeUrl: string | null; cancelReason: string | null; cancelledAt: string | null; createdAt: string; updatedAt: string };

const configs = new Map<string, LocalFiscalConfig>();
const documents: LocalFiscalDocument[] = [];

export function getLocalFiscalConfig(establishmentId: string) {
  return configs.get(establishmentId) ?? { establishmentId, active: false, provider: "FOCUS_NFE" as const, providerApiToken: null, environment: "HOMOLOGACAO" as const, stateRegistration: null, taxRegime: null, printDanfe: false };
}

export function updateLocalFiscalConfig(establishmentId: string, data: { active?: boolean; providerApiToken?: string | null; environment?: LocalFiscalEnvironment; stateRegistration?: string | null; taxRegime?: LocalFiscalTaxRegime | null; printDanfe?: boolean }) {
  const current = getLocalFiscalConfig(establishmentId);
  const updated: LocalFiscalConfig = { ...current, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
  configs.set(establishmentId, updated);
  return updated;
}

export function listLocalFiscalDocuments(establishmentId: string) {
  return documents.filter(doc => doc.establishmentId === establishmentId).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(doc => ({ ...doc }));
}

export function findLocalFiscalDocument(establishmentId: string, saleId: string) {
  return documents.find(doc => doc.establishmentId === establishmentId && doc.saleId === saleId) ?? null;
}

export function upsertLocalFiscalDocument(establishmentId: string, saleId: string, data: Partial<Omit<LocalFiscalDocument, "id" | "establishmentId" | "saleId" | "createdAt">>) {
  const now = new Date().toISOString();
  const existing = documents.find(doc => doc.establishmentId === establishmentId && doc.saleId === saleId);
  if (existing) { Object.assign(existing, data, { updatedAt: now }); return { ...existing }; }
  const created: LocalFiscalDocument = { id: `local-fiscal-doc-${randomUUID()}`, establishmentId, saleId, status: "PENDING", environment: "HOMOLOGACAO", accessKey: null, number: null, series: null, statusMessage: null, danfeUrl: null, qrCodeUrl: null, cancelReason: null, cancelledAt: null, createdAt: now, updatedAt: now, ...data };
  documents.push(created);
  return { ...created };
}
