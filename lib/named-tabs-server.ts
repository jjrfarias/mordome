import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requestAuditMetadata } from "@/lib/audit";

type Actor = { establishment: { id: string }; organization: { id: string }; user: { id: string } };
type Action = { action: "CREATE_TAB"; tableId: string; name: string } | { action: "RENAME_TAB"; tabId: string; name: string } | { action: "CLOSE_EMPTY_TAB"; tabId: string };

export async function manageNamedTab(actor: Actor, input: Action, request: Request) {
  return db.$transaction(async tx => {
    const audit = { organizationId: actor.organization.id, establishmentId: actor.establishment.id, actorId: actor.user.id, entityType: "Tab", ...requestAuditMetadata(request) };
    if (input.action === "CREATE_TAB") {
      const table = await tx.diningTable.findFirst({ where: { id: input.tableId, establishmentId: actor.establishment.id, active: true, isCounter: false } });
      if (!table) throw new Error("TABLE_NOT_FOUND");
      const tab = await tx.tab.create({ data: { tableId: table.id, establishmentId: actor.establishment.id, openedById: actor.user.id, name: input.name } });
      await tx.auditEvent.create({ data: { ...audit, action: "TAB_OPEN", entityId: tab.id, reason: `Comanda ${tab.name} aberta na mesa ${table.number}`, after: { tableNumber: table.number, name: tab.name } } });
      return tab.id;
    }
    const tab = await tx.tab.findFirst({ where: { id: input.tabId, establishmentId: actor.establishment.id, status: "OPEN", table: { isCounter: false } }, include: { items: true } });
    if (!tab) throw new Error("TAB_NOT_FOUND");
    if (input.action === "RENAME_TAB") {
      await tx.tab.update({ where: { id: tab.id }, data: { name: input.name } });
      await tx.auditEvent.create({ data: { ...audit, action: "UPDATE", entityId: tab.id, reason: "Identificação da comanda alterada", before: { name: tab.name }, after: { name: input.name } } });
    } else {
      if (tab.items.some(item => item.active && Number(item.quantity) > 0)) throw new Error("TAB_NOT_EMPTY");
      await tx.tab.update({ where: { id: tab.id }, data: { status: "CANCELLED", closedAt: new Date() } });
      await tx.auditEvent.create({ data: { ...audit, action: "TAB_CLOSE", entityId: tab.id, reason: "Comanda vazia encerrada", after: { status: "CANCELLED", name: tab.name } } });
    }
    return undefined;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
