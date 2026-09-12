export type IntegrationCategory = "PRINTER" | "PAYMENT" | "SCALE";

export type DriverStatus = "available" | "planned";

export type DriverConfigField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

export type DriverDefinition = {
  key: string;
  label: string;
  description: string;
  status: DriverStatus;
  configFields: DriverConfigField[];
};

export const PRINTER_DRIVERS: DriverDefinition[] = [
  {
    key: "manual",
    label: "Nenhuma (fluxo manual)",
    description: "Comandas e recibos ficam só na tela; a equipe confere sem imprimir.",
    status: "available",
    configFields: [],
  },
  {
    key: "browser_print",
    label: "Impressão pelo navegador",
    description: "Abre a caixa de impressão do navegador com o recibo ou a comanda formatados. Funciona em qualquer computador ou tablet com impressora configurada no sistema operacional.",
    status: "available",
    configFields: [],
  },
  {
    key: "escpos_agent",
    label: "Agente de rede (impressora térmica ESC/POS)",
    description: "Envia o pedido de impressão para um pequeno serviço local instalado no computador da unidade, que fala diretamente com a impressora térmica. Requer instalar esse agente — ainda não implementado.",
    status: "planned",
    configFields: [{ key: "agentUrl", label: "Endereço do agente na rede local", placeholder: "http://192.168.1.50:9100", required: true }],
  },
];

export const PAYMENT_DRIVERS: DriverDefinition[] = [
  {
    key: "manual",
    label: "Confirmação manual",
    description: "O operador cobra na maquininha por fora e só marca a forma de pagamento no Mordomê. É o que o sistema faz hoje.",
    status: "available",
    configFields: [],
  },
  {
    key: "stone",
    label: "Stone (Smart POS)",
    description: "Confirmação automática via API da Stone. Requer credenciais de desenvolvedor da Stone para essa unidade — ainda não implementado.",
    status: "planned",
    configFields: [{ key: "merchantId", label: "Merchant ID da Stone", required: true }],
  },
  {
    key: "cielo",
    label: "Cielo (LIO)",
    description: "Confirmação automática via API da Cielo. Requer credenciais de desenvolvedor da Cielo para essa unidade — ainda não implementado.",
    status: "planned",
    configFields: [{ key: "merchantId", label: "Merchant ID da Cielo", required: true }],
  },
  {
    key: "mercado_pago",
    label: "Mercado Pago (Point)",
    description: "Confirmação automática via API do Mercado Pago. Requer credenciais de desenvolvedor do Mercado Pago para essa unidade — ainda não implementado.",
    status: "planned",
    configFields: [{ key: "accessToken", label: "Access Token do Mercado Pago", required: true }],
  },
];

export const SCALE_DRIVERS: DriverDefinition[] = [
  {
    key: "manual",
    label: "Entrada manual",
    description: "O operador digita o peso lido na balança. Funciona em qualquer dispositivo.",
    status: "available",
    configFields: [],
  },
  {
    key: "webserial",
    label: "Balança via USB (WebSerial)",
    description: "Lê o peso direto da balança conectada por USB, sem digitar. Só funciona em Chrome ou Edge no computador — não funciona em celular, tablet ou na maquininha de cartão. Ainda não implementado.",
    status: "planned",
    configFields: [],
  },
];

export const DRIVER_CATALOG: Record<IntegrationCategory, DriverDefinition[]> = {
  PRINTER: PRINTER_DRIVERS,
  PAYMENT: PAYMENT_DRIVERS,
  SCALE: SCALE_DRIVERS,
};

export function findDriver(category: IntegrationCategory, key: string) {
  return DRIVER_CATALOG[category].find(driver => driver.key === key);
}
