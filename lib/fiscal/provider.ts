import type { FiscalCancelResult, FiscalEmissionInput, FiscalEmitResult } from "./types.ts";

// Interface do provedor fiscal (ADR 0049) — hoje só existe uma implementação real (Focus NFe,
// `focus-nfe.ts`) e uma simulada (`mock-provider.ts`, usada em modo local); a interface existe
// para o resto do sistema (rota de vendas, fila de emissão) nunca depender de qual provedor está
// por trás, caso um dia outro provedor seja adicionado.
export type FiscalProvider = {
  emit(input: FiscalEmissionInput, config: { apiToken: string; environment: "HOMOLOGACAO" | "PRODUCAO" }): Promise<FiscalEmitResult>;
  cancel(saleId: string, justification: string, config: { apiToken: string; environment: "HOMOLOGACAO" | "PRODUCAO" }): Promise<FiscalCancelResult>;
};
