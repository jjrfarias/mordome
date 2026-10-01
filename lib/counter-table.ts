import type { Prisma } from "../generated/prisma/client.ts";

export async function getCounterTable(tx: Prisma.TransactionClient, establishmentId: string) {
  // Native upsert avoids catching a unique violation inside an aborted PG transaction.
  const table = await tx.diningTable.upsert({
    where: { establishmentId_number: { establishmentId, number: 0 } },
    create: { establishmentId, number: 0, seats: 0, name: "Balcão", isCounter: true },
    update: { name: "Balcão" },
    select: { id: true, isCounter: true },
  });
  if (!table.isCounter) throw new Error("COUNTER_TABLE_NUMBER_CONFLICT");
  return table;
}
