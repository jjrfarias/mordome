import { buildFocusNfcePayload } from "./payload.ts";
import type { FiscalCancelResult, FiscalEmissionInput, FiscalEmitResult } from "./types.ts";
import type { FiscalProvider } from "./provider.ts";

// Adaptador real do Focus NFe (ver ADR 0049). Contrato verificado na documentação oficial
// (https://doc.focusnfe.com.br/reference/emitir_nfce e /reference/cancelar_nfce) em 2026-09-17 —
// autenticação HTTP Basic com o token da empresa como usuário e senha em branco; `ref` na query
// string identifica a emissão de forma idempotente no lado do provedor (reenviar a mesma `ref`
// nunca duplica a nota). NFC-e é processada de forma síncrona: a própria resposta do POST já diz
// se foi autorizada ou rejeitada, sem precisar de webhook/polling.
const BASE_URL: Record<"HOMOLOGACAO" | "PRODUCAO", string> = {
  HOMOLOGACAO: "https://homologacao.focusnfe.com.br/v2",
  PRODUCAO: "https://api.focusnfe.com.br/v2",
};

function authHeader(apiToken: string) {
  return `Basic ${Buffer.from(`${apiToken}:`).toString("base64")}`;
}

export const focusNfeProvider: FiscalProvider = {
  async emit(input: FiscalEmissionInput, config): Promise<FiscalEmitResult> {
    const built = buildFocusNfcePayload(input);
    if ("error" in built) return { status: "ERROR", statusMessage: built.error };
    try {
      const response = await fetch(`${BASE_URL[config.environment]}/nfce?ref=${encodeURIComponent(input.saleId)}`, {
        method: "POST",
        headers: { Authorization: authHeader(config.apiToken), "Content-Type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      const data = await response.json().catch(() => ({}));
      if (data.status === "autorizado") {
        return { status: "AUTHORIZED", accessKey: data.chave_nfe ?? "", number: String(data.numero ?? ""), series: String(data.serie ?? ""), danfeUrl: data.caminho_danfe ?? null, qrCodeUrl: data.qrcode_url ?? null, statusMessage: data.mensagem_sefaz ?? "Autorizada" };
      }
      if (data.status === "erro_autorizacao") return { status: "REJECTED", statusMessage: data.mensagem_sefaz ?? "Rejeitada pela SEFAZ." };
      if (data.mensagem) return { status: "ERROR", statusMessage: data.mensagem };
      return { status: "ERROR", statusMessage: `Resposta inesperada do provedor fiscal (HTTP ${response.status}).` };
    } catch (cause) {
      return { status: "ERROR", statusMessage: cause instanceof Error ? `Falha de comunicação com o provedor fiscal: ${cause.message}` : "Falha de comunicação com o provedor fiscal." };
    }
  },

  async cancel(saleId: string, justification: string, config): Promise<FiscalCancelResult> {
    try {
      const response = await fetch(`${BASE_URL[config.environment]}/nfce/${encodeURIComponent(saleId)}`, {
        method: "DELETE",
        headers: { Authorization: authHeader(config.apiToken), "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa: justification }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.status === "cancelado") return { status: "CANCELLED", statusMessage: data.mensagem_sefaz ?? "Cancelada" };
      return { status: "ERROR", statusMessage: data.mensagem_sefaz ?? data.mensagem ?? `Não foi possível cancelar (HTTP ${response.status}).` };
    } catch (cause) {
      return { status: "ERROR", statusMessage: cause instanceof Error ? `Falha de comunicação com o provedor fiscal: ${cause.message}` : "Falha de comunicação com o provedor fiscal." };
    }
  },
};
