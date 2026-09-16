// Modelos de impressão (escopo estabelecimento) — um registro por unidade, apenas
// aparência do recibo de venda (ver ADR 0031). Sem exclusão: get/upsert simples.
export type LocalPrintTemplate = { headerText: string | null; footerText: string | null; showDocument: boolean; paperWidth: number };

export const DEFAULT_PRINT_TEMPLATE: LocalPrintTemplate = { headerText: null, footerText: null, showDocument: false, paperWidth: 80 };

const templatesByEstablishment = new Map<string, LocalPrintTemplate>();

export function getLocalPrintTemplate(establishmentId: string): LocalPrintTemplate {
  return templatesByEstablishment.get(establishmentId) ?? { ...DEFAULT_PRINT_TEMPLATE };
}

export function upsertLocalPrintTemplate(establishmentId: string, data: { headerText?: string | null; footerText?: string | null; showDocument: boolean; paperWidth: number }) {
  const template: LocalPrintTemplate = { headerText: data.headerText ?? null, footerText: data.footerText ?? null, showDocument: data.showDocument, paperWidth: data.paperWidth };
  templatesByEstablishment.set(establishmentId, template);
  return { ...template };
}
