import type { FiscalEmissionInput, FiscalPaymentMethod, FocusNfcePayload } from "./types.ts";

// Tabela oficial "Forma de Pagamento" da SEFAZ (usada por toda NFC-e, não é invenção do provedor)
// — mapeada a partir do nosso enum interno de forma de pagamento.
const PAYMENT_CODES: Record<FiscalPaymentMethod, string> = {
  CASH: "01",
  CREDIT_CARD: "03",
  DEBIT_CARD: "04",
  PIX: "17",
  OTHER: "99",
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Constrói o corpo exato que a API do provedor (Focus NFe) espera para emitir uma NFC-e (ver ADR
// 0049). Função pura, sem I/O — testável isoladamente. Nunca "inventa" um NCM/CFOP/CST ausente: se
// algum item não tem ficha fiscal completa, a emissão inteira é recusada aqui mesmo, antes de
// qualquer chamada de rede, com uma mensagem que identifica o produto — evita gastar uma tentativa
// de emissão (cobrada pelo provedor) com dado que a SEFAZ rejeitaria de qualquer forma.
export function buildFocusNfcePayload(input: FiscalEmissionInput): { payload: FocusNfcePayload } | { error: string } {
  if (input.items.length === 0) return { error: "Venda sem itens — nada para emitir." };
  const items = [];
  for (const [index, item] of input.items.entries()) {
    const missing = (["ncm", "cfop", "icmsCst", "icmsOrigin", "unitOfMeasure"] as const).filter(field => !item[field]);
    if (missing.length > 0) return { error: `Produto "${item.productName}" está sem dados fiscais cadastrados (${missing.join(", ")}). Complete o cadastro em Configurações → Dados fiscais dos produtos.` };
    items.push({
      numero_item: String(index + 1),
      codigo_ncm: item.ncm!,
      codigo_produto: String(index + 1),
      descricao: item.productName,
      quantidade_comercial: item.quantity,
      quantidade_tributavel: item.quantity,
      cfop: item.cfop!,
      valor_unitario_comercial: round2(item.unitPrice),
      valor_unitario_tributavel: round2(item.unitPrice),
      valor_bruto: round2(item.unitPrice * item.quantity),
      unidade_comercial: item.unitOfMeasure!,
      unidade_tributavel: item.unitOfMeasure!,
      icms_origem: item.icmsOrigin!,
      icms_situacao_tributaria: item.icmsCst!,
    });
  }
  if (input.payments.length === 0) return { error: "Venda sem pagamento registrado — nada para emitir." };
  const payload: FocusNfcePayload = {
    cnpj_emitente: input.cnpj.replace(/\D/g, ""),
    data_emissao: new Date().toISOString(),
    presenca_comprador: "1", // "Operação presencial" — PDV/Salão/Delivery com entrega no mesmo dia da venda
    modalidade_frete: "9", // "Sem transporte" — não há CT-e/frete próprio nesta fatia
    local_destino: "1", // "Operação interna" (mesmo estado)
    natureza_operacao: "VENDA AO CONSUMIDOR",
    items,
    formas_pagamento: input.payments.map(payment => ({ forma_pagamento: PAYMENT_CODES[payment.method], valor_pagamento: round2(payment.amount) })),
  };
  return { payload };
}
