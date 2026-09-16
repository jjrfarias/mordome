// Cálculo puro do relatório "Tempo de produção" (ADR 0039). Para cada pedido de cozinha (`Order`)
// enviado no período (`sentAt` dentro do período), mede o tempo entre o envio à cozinha (primeiro
// evento RECEIVED do histórico) e o momento em que ficou pronto (primeiro READY do histórico).
// Reaproveita `OrderTimingRecord`/`findFirstStatusEvent`/`shortOrderLabel` de `order-timing.ts`
// (mesma fonte de dados do relatório "Tempo por status"). Sem Prisma/Next, testável isoladamente.

import { findFirstStatusEvent, shortOrderLabel, type OrderTimingRecord } from "./order-timing.ts";

export type ProductionTimeRow = {
  orderId: string;
  orderLabel: string;
  tableLabel: string | null;
  sentAt: Date;
  readyAt: Date;
  durationSeconds: number;
};

export type ProductionTimeResult = {
  rows: ProductionTimeRow[];
  inProgressCount: number;
};

// Pedidos que nunca chegaram a READY no período (ainda em preparo, ou cancelados antes de ficar
// pronto) NÃO entram nas linhas nem no tempo médio — decisão mais simples do que reconstituir um
// estado "em andamento" sem um instante de conclusão para medir. `inProgressCount` apenas soma
// quantos pedidos do período caíram nesse caso, para o resumo poder informar isso sem escondê-los
// silenciosamente. Ordenado por horário de envio (cronológico).
export function buildProductionTimeRows(records: OrderTimingRecord[]): ProductionTimeResult {
  const rows: ProductionTimeRow[] = [];
  let inProgressCount = 0;

  for (const record of records) {
    const sentEvent = record.history[0];
    const readyEvent = findFirstStatusEvent(record, "READY");
    if (!sentEvent || !readyEvent) {
      inProgressCount += 1;
      continue;
    }
    rows.push({
      orderId: record.orderId,
      orderLabel: shortOrderLabel(record.orderId),
      tableLabel: record.tableLabel,
      sentAt: sentEvent.at,
      readyAt: readyEvent.at,
      durationSeconds: Math.max(0, Math.round((readyEvent.at.getTime() - sentEvent.at.getTime()) / 1000)),
    });
  }

  rows.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  return { rows, inProgressCount };
}

export type ProductionTimeSummary = {
  ordersCount: number;
  averageDurationSeconds: number;
  inProgressCount: number;
};

export function summarizeProductionTime(result: ProductionTimeResult): ProductionTimeSummary {
  const ordersCount = result.rows.length;
  const totalSeconds = result.rows.reduce((sum, row) => sum + row.durationSeconds, 0);
  return {
    ordersCount,
    averageDurationSeconds: ordersCount > 0 ? Math.round(totalSeconds / ordersCount) : 0,
    inProgressCount: result.inProgressCount,
  };
}
