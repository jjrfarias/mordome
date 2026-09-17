// Formato compartilhado entre app/page.tsx e os componentes que decidem se imprimem o recibo
// comum ou o DANFE-NFC-e (ADR 0049, adendo) — devolvido por `POST /api/operations/sales` quando o
// módulo fiscal da unidade está ativo. `null` cobre "sem módulo fiscal" e "erro antes de saber o
// resultado" — em ambos os casos, quem consome isso deve imprimir o recibo comum de sempre.
export type FiscalPrintInfo = { status: string; statusMessage: string | null; printDanfe: boolean; accessKey: string | null; number: string | null; series: string | null; qrCodeUrl: string | null; environment: string } | null;
