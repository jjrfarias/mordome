export type ReceiptLine = { name: string; quantity: number; unitPrice: number };

// Modelos de impressão (ver ADR 0031): personalização puramente visual do recibo de
// venda. Quando nada foi configurado, os padrões abaixo reproduzem exatamente o
// recibo original (280px, sem cabeçalho/rodapé extra, sem documento) — zero regressão.
export type ReceiptTemplate = { headerText?: string | null; footerText?: string | null; showDocument?: boolean; paperWidth?: number; establishmentDocument?: string | null };

function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed"; iframe.style.right = "0"; iframe.style.bottom = "0"; iframe.style.width = "0"; iframe.style.height = "0"; iframe.style.border = "0";
  document.body.appendChild(iframe); const doc = iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open(); doc.write(html); doc.close(); iframe.onload = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000); };
}

export function buildReceiptHtml(input: { establishmentName: string; items: ReceiptLine[]; total: number; payment: string; channel: "POS" | "FLOOR"; table?: number }, template?: ReceiptTemplate) {
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const rows = input.items.map(item => `<tr><td>${item.quantity}x ${escapeHtml(item.name)}</td><td class="right">${money(item.unitPrice * item.quantity)}</td></tr>`).join("");
  const title = input.channel === "POS" ? "Venda direta" : `Mesa ${input.table ?? ""}`;
  const widthPx = (template?.paperWidth ?? 80) === 58 ? 200 : 280;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Recibo</title><style>
    body{font-family:'Courier New',monospace;width:${widthPx}px;margin:0 auto;padding:12px;color:#000}
    h1{font-size:14px;text-align:center;margin:0 0 4px}
    p{font-size:11px;text-align:center;margin:0 0 10px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    td{padding:2px 0}
    .right{text-align:right}
    .divider{border-top:1px dashed #000;margin:8px 0}
    .total{font-weight:bold;font-size:13px}
  </style></head><body>
    <h1>${escapeHtml(input.establishmentName)}</h1>
    ${template?.showDocument && template.establishmentDocument ? `<p>${escapeHtml(template.establishmentDocument)}</p>` : ""}
    ${template?.headerText ? `<p>${escapeHtml(template.headerText)}</p>` : ""}
    <p>${escapeHtml(title)}</p>
    <div class="divider"></div>
    <table>${rows}</table>
    <div class="divider"></div>
    <table><tr class="total"><td>Total</td><td class="right">${money(input.total)}</td></tr></table>
    <p>Pagamento: ${escapeHtml(input.payment)}</p>
    <p>${new Date().toLocaleString("pt-BR")}</p>
    ${template?.footerText ? `<div class="divider"></div><p>${escapeHtml(template.footerText)}</p>` : ""}
  </body></html>`;
}

export function printReceipt(input: { establishmentName: string; items: ReceiptLine[]; total: number; payment: string; channel: "POS" | "FLOOR"; table?: number }, template?: ReceiptTemplate) {
  printHtml(buildReceiptHtml(input, template));
}

export function printKitchenOrder(input: { establishmentName: string; stationName: string; label: string; orderId: string; sentAt: string; items: { name: string; quantity: number }[] }) {
  const rows = input.items.map(item => `<tr><td class="qty">${item.quantity}x</td><td>${escapeHtml(item.name)}</td></tr>`).join("");
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${escapeHtml(input.stationName)}</title><style>body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:12px;color:#000}h1,h2,p{margin:0;text-align:center}h1{font-size:13px}h2{font-size:22px;margin:7px 0}.station{font-size:13px;font-weight:bold;text-transform:uppercase}.divider{border-top:1px dashed #000;margin:9px 0}table{width:100%;border-collapse:collapse;font-size:15px;font-weight:bold}td{padding:5px 0;vertical-align:top}.qty{width:38px}.meta{font-size:9px;margin-top:9px}</style></head><body><h1>${escapeHtml(input.establishmentName)}</h1><h2>${escapeHtml(input.label.toUpperCase())}</h2><p class="station">${escapeHtml(input.stationName)}</p><div class="divider"></div><table>${rows}</table><div class="divider"></div><p class="meta">Pedido ${escapeHtml(input.orderId.slice(-8))} · ${new Date(input.sentAt).toLocaleString("pt-BR")}</p></body></html>`);
}

// DANFE-NFC-e simplificado (ADR 0049, adendo) — impresso no lugar do recibo comum quando a
// unidade ativar "Imprimir o DANFE-NFC-e" em Configurações → Dados fiscais. O QR code é gerado a
// partir da URL de consulta que o provedor devolve (`qrCodeUrl`), via um serviço público de
// imagem de QR code (sem biblioteca nova no projeto) — sem essa URL (emissão simulada em modo
// local, por exemplo), mostra só a chave de acesso em texto, nunca inventa um QR falso.
export type DanfeInput = { establishmentName: string; items: ReceiptLine[]; total: number; payment: string; accessKey: string; number: string; series: string; qrCodeUrl: string | null; environment: "HOMOLOGACAO" | "PRODUCAO" };

// Extraído como função pura (`buildDanfeHtml`) para ser testável isoladamente — `printDanfe`
// (efeito colateral: abre o iframe e chama `window.print()`) só chama ela e imprime o resultado.
export function buildDanfeHtml(input: DanfeInput) {
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const rows = input.items.map(item => `<tr><td>${item.quantity}x ${escapeHtml(item.name)}</td><td class="right">${money(item.unitPrice * item.quantity)}</td></tr>`).join("");
  const accessKeyFormatted = input.accessKey.replace(/(.{4})/g, "$1 ").trim();
  const qrImage = input.qrCodeUrl ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(input.qrCodeUrl)}" width="140" height="140" alt="QR code da NFC-e" />` : `<p class="meta">QR code disponível só na nota emitida pelo provedor real (esta é uma simulação).</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>DANFE NFC-e</title><style>
    body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:12px;color:#000;text-align:center}
    h1{font-size:14px;margin:0 0 4px}
    p{font-size:11px;margin:0 0 6px}
    table{width:100%;border-collapse:collapse;font-size:11px;text-align:left}
    td{padding:2px 0}
    .right{text-align:right}
    .divider{border-top:1px dashed #000;margin:8px 0}
    .total{font-weight:bold;font-size:13px}
    .tag{font-weight:bold;font-size:12px;text-transform:uppercase}
    .key{font-size:9px;word-break:break-all}
    .meta{font-size:9px;color:#333}
  </style></head><body>
    <h1>${escapeHtml(input.establishmentName)}</h1>
    <p class="tag">DANFE NFC-e${input.environment === "HOMOLOGACAO" ? " — AMBIENTE DE HOMOLOGAÇÃO, SEM VALOR FISCAL" : ""}</p>
    <p>NFC-e nº ${escapeHtml(input.number)} série ${escapeHtml(input.series)}</p>
    <div class="divider"></div>
    <table>${rows}</table>
    <div class="divider"></div>
    <table><tr class="total"><td>Total</td><td class="right">${money(input.total)}</td></tr></table>
    <p>Pagamento: ${escapeHtml(input.payment)}</p>
    <div class="divider"></div>
    ${qrImage}
    <p class="key">Chave de acesso<br/>${escapeHtml(accessKeyFormatted)}</p>
    <p class="meta">${new Date().toLocaleString("pt-BR")}</p>
  </body></html>`;
}

export function printDanfe(input: DanfeInput) {
  printHtml(buildDanfeHtml(input));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
