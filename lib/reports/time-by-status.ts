// Cálculo puro do relatório "Tempo por status" (ADR 0039). Para o período, calcula o tempo médio
// que os pedidos passam em cada status (RECEIVED até virar PREPARING, PREPARING até READY, READY
// até DELIVERED) — agregado por status, não por pedido individual. Reaproveita
// `computeConsecutiveDurations` de `order-timing.ts` (mesma fonte de dados do relatório "Tempo de
// produção"). Sem Prisma/Next, testável isoladamente.

import { computeConsecutiveDurations, type OrderStatusValue, type OrderTimingRecord } from "./order-timing.ts";

// Só esses três fazem sentido como "tempo passado no status X esperando a próxima etapa": DELIVERED
// e CANCELLED são estados finais, não têm "tempo até a próxima etapa" a medir.
const MEASURED_STATUSES: OrderStatusValue[] = ["RECEIVED", "PREPARING", "READY"];

export type TimeByStatusRow = {
  status: OrderStatusValue;
  averageDurationSeconds: number;
  ordersCount: number;
};

// Agrega, por status de ORIGEM de cada transição consecutiva do histórico, a duração média e a
// quantidade de pedidos que passaram por aquela transição no período. Uma transição RECEIVED→
// CANCELLED (pedido cancelado ainda em preparo) também conta como tempo passado em RECEIVED — o
// pedido genuinamente esperou aquele tempo nesse status antes de sair dele, independente de para
// onde foi depois. Só entram nas linhas os status com ao menos uma transição observada no período.
export function buildTimeByStatusRows(records: OrderTimingRecord[]): TimeByStatusRow[] {
  const totals = new Map<OrderStatusValue, { totalMs: number; count: number }>();

  for (const record of records) {
    for (const duration of computeConsecutiveDurations(record)) {
      if (!MEASURED_STATUSES.includes(duration.fromStatus)) continue;
      const entry = totals.get(duration.fromStatus) ?? { totalMs: 0, count: 0 };
      entry.totalMs += duration.durationMs;
      entry.count += 1;
      totals.set(duration.fromStatus, entry);
    }
  }

  return MEASURED_STATUSES.filter(status => totals.has(status)).map(status => {
    const entry = totals.get(status)!;
    return {
      status,
      averageDurationSeconds: Math.round(entry.totalMs / entry.count / 1000),
      ordersCount: entry.count,
    };
  });
}
