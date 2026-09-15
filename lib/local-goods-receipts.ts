import { randomUUID } from "node:crypto";

export type LocalGoodsReceiptStatus = "DRAFT" | "CONFIRMED";

export type LocalGoodsReceiptItem = {
  id: string;
  inventoryItemId: string;
  quantity: number;
  unitCost: number;
  stockMovementId: string | null;
};

export type LocalGoodsReceiptNote = {
  id: string;
  establishmentId: string;
  supplierId: string | null;
  documentNumber: string | null;
  receivedAt: string;
  notes: string | null;
  status: LocalGoodsReceiptStatus;
  createdById: string;
  createdAt: string;
  confirmedAt: string | null;
  items: LocalGoodsReceiptItem[];
};

const notes: LocalGoodsReceiptNote[] = [];

function serialize(note: LocalGoodsReceiptNote): LocalGoodsReceiptNote {
  return { ...note, items: note.items.map(item => ({ ...item })) };
}

export function listLocalGoodsReceiptNotes(establishmentId: string, filters?: { status?: LocalGoodsReceiptStatus; from?: string; to?: string }) {
  return notes
    .filter(note => note.establishmentId === establishmentId)
    .filter(note => !filters?.status || note.status === filters.status)
    .filter(note => !filters?.from || note.receivedAt >= filters.from)
    .filter(note => !filters?.to || note.receivedAt <= filters.to)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .map(serialize);
}

export function getLocalGoodsReceiptNote(establishmentId: string, noteId: string) {
  const note = notes.find(item => item.id === noteId && item.establishmentId === establishmentId);
  return note ? serialize(note) : null;
}

export function createLocalGoodsReceiptNote(establishmentId: string, actorId: string, data: { supplierId?: string | null; documentNumber?: string | null; receivedAt: string; notes?: string | null }) {
  const note: LocalGoodsReceiptNote = {
    id: `local-goods-receipt-${randomUUID()}`,
    establishmentId,
    supplierId: data.supplierId ?? null,
    documentNumber: data.documentNumber ?? null,
    receivedAt: data.receivedAt,
    notes: data.notes ?? null,
    status: "DRAFT",
    createdById: actorId,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    items: [],
  };
  notes.push(note);
  return serialize(note);
}

export function updateLocalGoodsReceiptNote(establishmentId: string, noteId: string, changes: { supplierId?: string | null; documentNumber?: string | null; receivedAt?: string; notes?: string | null }) {
  const note = notes.find(item => item.id === noteId && item.establishmentId === establishmentId);
  if (!note) return "NOT_FOUND" as const;
  if (note.status !== "DRAFT") return "NOT_DRAFT" as const;
  if (changes.supplierId !== undefined) note.supplierId = changes.supplierId;
  if (changes.documentNumber !== undefined) note.documentNumber = changes.documentNumber;
  if (changes.receivedAt !== undefined) note.receivedAt = changes.receivedAt;
  if (changes.notes !== undefined) note.notes = changes.notes;
  return serialize(note);
}

export function addLocalGoodsReceiptItem(establishmentId: string, noteId: string, item: { inventoryItemId: string; quantity: number; unitCost: number }) {
  const note = notes.find(candidate => candidate.id === noteId && candidate.establishmentId === establishmentId);
  if (!note) return "NOT_FOUND" as const;
  if (note.status !== "DRAFT") return "NOT_DRAFT" as const;
  const record: LocalGoodsReceiptItem = { id: `local-goods-receipt-item-${randomUUID()}`, inventoryItemId: item.inventoryItemId, quantity: item.quantity, unitCost: item.unitCost, stockMovementId: null };
  note.items.push(record);
  return serialize(note);
}

export function removeLocalGoodsReceiptItem(establishmentId: string, noteId: string, itemId: string) {
  const note = notes.find(candidate => candidate.id === noteId && candidate.establishmentId === establishmentId);
  if (!note) return "NOT_FOUND" as const;
  if (note.status !== "DRAFT") return "NOT_DRAFT" as const;
  const index = note.items.findIndex(candidate => candidate.id === itemId);
  if (index === -1) return "ITEM_NOT_FOUND" as const;
  note.items.splice(index, 1);
  return serialize(note);
}

export function confirmLocalGoodsReceiptNote(establishmentId: string, noteId: string, createStockEntry: (item: { inventoryItemId: string; quantity: number; unitCost: number }) => { id: string } | null) {
  const note = notes.find(candidate => candidate.id === noteId && candidate.establishmentId === establishmentId);
  if (!note) return "NOT_FOUND" as const;
  if (note.status === "CONFIRMED") return "ALREADY_CONFIRMED" as const;
  if (note.items.length === 0) return "EMPTY" as const;
  for (const item of note.items) {
    const movement = createStockEntry({ inventoryItemId: item.inventoryItemId, quantity: item.quantity, unitCost: item.unitCost });
    if (!movement) return "ITEM_NOT_FOUND" as const;
    item.stockMovementId = movement.id;
  }
  note.status = "CONFIRMED";
  note.confirmedAt = new Date().toISOString();
  return serialize(note);
}
