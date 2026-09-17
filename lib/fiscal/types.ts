// Fundação fiscal (ADR 0049) — tipos compartilhados entre o construtor de payload (puro, sem
// Prisma/Next, testável isoladamente) e os adaptadores de provedor.

export type FiscalPaymentMethod = "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "CASH" | "OTHER";

export type FiscalSaleItemInput = {
  productName: string;
  quantity: number;
  unitPrice: number;
  ncm: string | null;
  cfop: string | null;
  icmsCst: string | null;
  icmsOrigin: string | null;
  unitOfMeasure: string | null;
};

export type FiscalPaymentInput = { method: FiscalPaymentMethod; amount: number };

export type FiscalEmissionInput = {
  saleId: string;
  cnpj: string;
  items: FiscalSaleItemInput[];
  payments: FiscalPaymentInput[];
};

// Formato de envio ao provedor (Focus NFe) — nomes de campo em português, exatamente como a API
// espera (ver https://doc.focusnfe.com.br/reference/emitir_nfce), não um formato nosso.
export type FocusNfceItem = {
  numero_item: string;
  codigo_ncm: string;
  codigo_produto: string;
  descricao: string;
  quantidade_comercial: number;
  quantidade_tributavel: number;
  cfop: string;
  valor_unitario_comercial: number;
  valor_unitario_tributavel: number;
  valor_bruto: number;
  unidade_comercial: string;
  unidade_tributavel: string;
  icms_origem: string;
  icms_situacao_tributaria: string;
};

export type FocusNfcePaymentEntry = { forma_pagamento: string; valor_pagamento: number };

export type FocusNfcePayload = {
  cnpj_emitente: string;
  data_emissao: string;
  presenca_comprador: string;
  modalidade_frete: string;
  local_destino: string;
  natureza_operacao: string;
  items: FocusNfceItem[];
  formas_pagamento: FocusNfcePaymentEntry[];
};

// Resultado normalizado que os adaptadores (real ou simulado) devolvem — mesmo formato
// independente do provedor por trás, para a camada de emissão/persistência nunca precisar saber
// qual provedor respondeu.
export type FiscalEmitResult =
  | { status: "AUTHORIZED"; accessKey: string; number: string; series: string; danfeUrl: string | null; qrCodeUrl: string | null; statusMessage: string }
  | { status: "REJECTED"; statusMessage: string }
  | { status: "ERROR"; statusMessage: string };

export type FiscalCancelResult = { status: "CANCELLED"; statusMessage: string } | { status: "ERROR"; statusMessage: string };
