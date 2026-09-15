import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Plus, Trash2 } from "lucide-react";

type InventoryItemOption = { id: string; establishmentItemId: string | null; name: string; configured: boolean };
type Supplier = { id: string; name: string; active: boolean };
type NoteItem = { id: string; inventoryItemId: string; quantity: number; unitCost: number; stockMovementId: string | null };
type Note = {
  id: string;
  supplierId: string | null;
  supplierName?: string | null;
  documentNumber: string | null;
  receivedAt: string;
  notes: string | null;
  status: "DRAFT" | "CONFIRMED";
  createdAt: string;
  confirmedAt: string | null;
  items: NoteItem[];
};

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function noteTotal(note: Note) {
  return note.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
}

export function GoodsReceiptNotes({ items }: { items: InventoryItemOption[] }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "DRAFT" | "CONFIRMED">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [noteNotes, setNoteNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`/api/admin/inventory/goods-receipts?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as notas de entrada.");
      setNotes(data.notes ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as notas de entrada.");
    } finally { setLoading(false); }
  }, [statusFilter, from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/finance/suppliers", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (response.ok) setSuppliers((data.suppliers ?? []).filter((supplier: Supplier) => supplier.active));
      } catch { /* fornecedores são opcionais nesta tela */ }
    })();
  }, []);

  const createNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!receivedAt) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/goods-receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CREATE_NOTE", supplierId: supplierId || undefined, documentNumber: documentNumber.trim() || undefined, receivedAt, notes: noteNotes.trim() || undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a nota de entrada.");
      setSupplierId(""); setDocumentNumber(""); setNoteNotes("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a nota de entrada.");
    } finally { setCreating(false); }
  };

  return <div className="goods-receipts">
    <section className="panel">
      <h3>Nova nota de entrada</h3>
      <form className="inventory-create-form" onSubmit={createNote}>
        <label className="field"><span>Fornecedor (opcional)</span>
          <select value={supplierId} onChange={event => setSupplierId(event.target.value)}>
            <option value="">Sem fornecedor cadastrado</option>
            {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Nº da nota/fatura (opcional)</span><input value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} placeholder="Ex.: NF 1234" /></label>
        <label className="field"><span>Data de recebimento</span><input type="date" value={receivedAt} onChange={event => setReceivedAt(event.target.value)} /></label>
        <label className="field"><span>Observações (opcional)</span><input value={noteNotes} onChange={event => setNoteNotes(event.target.value)} /></label>
        <button className="primary" disabled={creating || !receivedAt}><Plus />Criar rascunho</button>
      </form>
    </section>

    <section className="panel">
      <h3>Filtros</h3>
      <div className="inventory-create-form">
        <label className="field"><span>Status</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="">Todas</option>
            <option value="DRAFT">Rascunho</option>
            <option value="CONFIRMED">Confirmada</option>
          </select>
        </label>
        <label className="field"><span>De</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="field"><span>Até</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      </div>
    </section>

    {error && <div className="auth-error" role="alert">{error}</div>}
    {loading && <div className="empty"><span>Carregando notas de entrada…</span></div>}
    {!loading && notes.length === 0 && <div className="big-empty"><ClipboardList /><h2>Nenhuma nota de entrada</h2><p>Registre a chegada de mercadoria de um fornecedor para dar entrada no estoque.</p></div>}
    {!loading && notes.length > 0 && <section className="inventory-list">
      {notes.map(note => <NoteRow key={note.id} note={note} items={items} onChanged={load} />)}
    </section>}
  </div>;
}

function NoteRow({ note, items, onChanged }: { note: Note; items: InventoryItemOption[]; onChanged: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [establishmentItemId, setEstablishmentItemId] = useState(() => items.find(item => item.configured)?.establishmentItemId ?? "");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const configuredItems = items.filter(item => item.configured && item.establishmentItemId);
  const isDraft = note.status === "DRAFT";

  const addItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericQuantity = Number(quantity.replace(",", "."));
    const numericCost = Number(unitCost.replace(",", "."));
    if (!establishmentItemId || !Number.isFinite(numericQuantity) || numericQuantity <= 0 || !Number.isFinite(numericCost) || numericCost < 0) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/goods-receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ADD_ITEM", noteId: note.id, establishmentItemId, quantity: numericQuantity, unitCost: numericCost }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível adicionar o item.");
      setQuantity(""); setUnitCost(""); await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar o item.");
    } finally { setSaving(false); }
  };

  const removeItem = async (itemId: string) => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/goods-receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REMOVE_ITEM", noteId: note.id, itemId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível remover o item.");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover o item.");
    } finally { setSaving(false); }
  };

  const confirmNote = async () => {
    if (note.items.length === 0) { setError("Adicione ao menos um item antes de confirmar."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/goods-receipts/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId: note.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível confirmar a nota.");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar a nota.");
    } finally { setSaving(false); }
  };

  return <article className="inventory-row">
    <div className="inventory-icon"><ClipboardList /></div>
    <div className="inventory-identity">
      <small>{new Date(note.receivedAt).toLocaleDateString("pt-BR")} · {note.supplierName ?? "Sem fornecedor"}{note.documentNumber ? ` · ${note.documentNumber}` : ""}</small>
      <strong>{note.status === "DRAFT" ? "Rascunho" : "Confirmada"}</strong>
    </div>
    <div className="inventory-balance"><small>Total</small><strong>{money(noteTotal(note))}</strong></div>
    <div className="inventory-actions">
      <button className="secondary" onClick={() => setExpanded(current => !current)}>{expanded ? "Ocultar itens" : `Ver itens (${note.items.length})`}</button>
      {isDraft && <button className="primary" disabled={saving} onClick={() => void confirmNote()}><CheckCircle2 />Confirmar</button>}
    </div>
    {expanded && <div className="stock-entry-form">
      <ul className="goods-receipt-items">
        {note.items.length === 0 && <li>Nenhum item adicionado ainda.</li>}
        {note.items.map(item => {
          const inventoryItem = items.find(candidate => candidate.establishmentItemId === item.inventoryItemId);
          return <li key={item.id}>
            <span>{inventoryItem?.name ?? item.inventoryItemId}</span>
            <span>{item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} × {money(item.unitCost)}</span>
            <span>{money(item.quantity * item.unitCost)}</span>
            {isDraft && <button className="link-danger" disabled={saving} onClick={() => void removeItem(item.id)}><Trash2 size={14} /></button>}
          </li>;
        })}
      </ul>
      {isDraft && <form className="stock-entry-form" onSubmit={addItem}>
        <label className="field"><span>Item</span>
          <select value={establishmentItemId} onChange={event => setEstablishmentItemId(event.target.value)}>
            {configuredItems.length === 0 && <option value="">Nenhum item configurado nesta unidade</option>}
            {configuredItems.map(item => <option key={item.establishmentItemId!} value={item.establishmentItemId!}>{item.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Quantidade</span><input inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="0" /></label>
        <label className="field"><span>Custo unitário</span><input inputMode="decimal" value={unitCost} onChange={event => setUnitCost(event.target.value)} placeholder="R$ 0,00" /></label>
        <button className="primary" disabled={saving || configuredItems.length === 0}><Plus />Adicionar item</button>
      </form>}
      {error && <span className="inline-error">{error}</span>}
    </div>}
  </article>;
}
