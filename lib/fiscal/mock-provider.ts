import { randomUUID } from "node:crypto";
import { buildFocusNfcePayload } from "./payload.ts";
import type { FiscalCancelResult, FiscalEmissionInput, FiscalEmitResult } from "./types.ts";
import type { FiscalProvider } from "./provider.ts";

// Provedor simulado (ADR 0049), usado só em modo local — nunca faz nenhuma chamada de rede. Ainda
// assim valida os dados fiscais dos itens com a mesma função pura usada pelo provedor real
// (`buildFocusNfcePayload`), então um produto sem NCM/CFOP cadastrado falha exatamente como
// falharia com o Focus NFe de verdade — a demonstração local é fiel ao comportamento real nesse
// ponto, só não chega a "conversar" com nenhuma SEFAZ.
export const mockFiscalProvider: FiscalProvider = {
  async emit(input: FiscalEmissionInput): Promise<FiscalEmitResult> {
    const built = buildFocusNfcePayload(input);
    if ("error" in built) return { status: "ERROR", statusMessage: built.error };
    const accessKey = `SIMULADO${randomUUID().replace(/-/g, "").slice(0, 36).toUpperCase()}`;
    return { status: "AUTHORIZED", accessKey, number: String(Math.floor(Math.random() * 9000) + 1000), series: "1", danfeUrl: null, qrCodeUrl: null, statusMessage: "Autorizada (simulação — modo local, nenhuma SEFAZ foi consultada)" };
  },

  async cancel(): Promise<FiscalCancelResult> {
    return { status: "CANCELLED", statusMessage: "Cancelada (simulação — modo local)" };
  },
};
