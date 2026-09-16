// Extração pura e compartilhada de durações entre transições de status de pedido de cozinha
// (ADR 0039 — Tempo de produção e Tempo por status). Os dois relatórios olham para o mesmo dado
// bruto — o histórico de status de cada `Order` (`OrderStatusHistory` no modo servidor,
// `LocalOrder.statusHistory` no modo local) — mas calculam coisas diferentes: "Tempo de produção"
// olha o intervalo entre o primeiro evento (RECEIVED, no envio à cozinha) e o primeiro READY;
// "Tempo por status" agrega a duração de CADA transição consecutiva, por status de origem. Esta
// função (`computeConsecutiveDurations`) é o núcleo comum reaproveitado pelos dois, para não
// duplicar a lógica de "quanto tempo entre a transição X e a transição Y". Sem Prisma/Next,
// testável isoladamente com `node --test`.

export type OrderStatusValue = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";

export type OrderStatusEvent = {
  status: OrderStatusValue;
  at: Date;
};

// Um pedido normalizado com seu histórico de status em ordem cronológica ASCENDENTE. O primeiro
// evento é sempre RECEIVED — tanto no modo servidor (`Order` sempre nasce com um
// `OrderStatusHistory` de status RECEIVED na mesma transação do envio, ver
// `app/api/operations/floor/route.ts`, `sendOrder`) quanto no modo local (`sendLocalOrder` grava o
// mesmo evento inicial) — então o instante desse primeiro evento equivale ao `sentAt` do pedido.
export type OrderTimingRecord = {
  orderId: string;
  tableLabel: string | null;
  history: OrderStatusEvent[];
};

export type StatusTransitionDuration = {
  orderId: string;
  fromStatus: OrderStatusValue;
  toStatus: OrderStatusValue;
  durationMs: number;
};

// Função pura compartilhada: extrai a duração entre cada par de transições consecutivas do
// histórico (já ordenado ascendente) de um único pedido. Ex.: histórico [RECEIVED@t0, PREPARING@t1,
// READY@t2] gera duas durações: (RECEIVED→PREPARING, t1-t0) e (PREPARING→READY, t2-t1).
export function computeConsecutiveDurations(record: OrderTimingRecord): StatusTransitionDuration[] {
  const durations: StatusTransitionDuration[] = [];
  for (let index = 1; index < record.history.length; index += 1) {
    const previous = record.history[index - 1];
    const current = record.history[index];
    durations.push({
      orderId: record.orderId,
      fromStatus: previous.status,
      toStatus: current.status,
      durationMs: current.at.getTime() - previous.at.getTime(),
    });
  }
  return durations;
}

// Primeira ocorrência de um status no histórico do pedido (ex.: primeiro READY), ou `undefined` se
// o pedido nunca passou por esse status no período consultado.
export function findFirstStatusEvent(record: OrderTimingRecord, status: OrderStatusValue): OrderStatusEvent | undefined {
  return record.history.find(event => event.status === status);
}

// Identificador curto exibido nas linhas dos relatórios: últimos 6 caracteres do id do pedido, em
// maiúsculo — evita mostrar o cuid inteiro na tabela, mesmo padrão informal usado em telas de
// operação para referenciar um pedido rapidamente.
export function shortOrderLabel(orderId: string): string {
  return orderId.slice(-6).toUpperCase();
}
