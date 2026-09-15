import { useCallback, useEffect, useState } from "react";
import { FileOutput, Plus, Send, ShoppingCart, Trash2, XCircle } from "lucide-react";

type InventoryItemOption = { id: string; establishmentItemId: string | null; name: string; configured: boolean };
type Supplier = { id: string; name: string; active: boolean };
type OrderItem = { id: string; inventoryItemId: string; quantity: number; estimatedUnitCost: number };
type Order = {
  id: string;
  supplierId: string | null;
  supplierName?: string | null;
  expectedDate: string | null;
  notes: string | null;
  status: "DRAFT" | "SENT" | "RECEIVED" | "CANCELLED";
  createdAt: string;
  sentAt: string | null;
  generatedNoteId: string | null;
  items: OrderItem[];
};

const statusLabels: Record<Order["status"], string> = { DRAFT: "Rascunho", SENT: "Enviada", RECEIVED: "Recebida", CANCELLED: "Cancelada" };

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function orderTotal(order: Order) {
  return order.items.reduce((sum, item) => sum + item.quantity * item.estimatedUnitCost, 0);
}

export function PurchaseOrders({ items }: { items: InventoryItemOption[] }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | Order["status"]>("");
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(`/api/admin/inventory/purchase-orders?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as ordens de compra.");
      setOrders(data.orders ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as ordens de compra.");
    } finally { setLoading(false); }
  }, [statusFilter]);

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

  const createOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CREATE_ORDER", supplierId: supplierId || undefined, expectedDate: expectedDate || undefined, notes: orderNotes.trim() || undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a ordem de compra.");
      setSupplierId(""); setExpectedDate(""); setOrderNotes("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a ordem de compra.");
    } finally { setCreating(false); }
  };

  return <div className="goods-receipts">
    <section className="panel">
      <h3>Nova ordem de compra</h3>
      <form className="inventory-create-form" onSubmit={createOrder}>
        <label className="field"><span>Fornecedor (opcional)</span>
          <select value={supplierId} onChange={event => setSupplierId(event.target.value)}>
            <option value="">Sem fornecedor cadastrado</option>
            {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Data prevista (opcional)</span><input type="date" value={expectedDate} onChange={event => setExpectedDate(event.target.value)} /></label>
        <label className="field"><span>Observações (opcional)</span><input value={orderNotes} onChange={event => setOrderNotes(event.target.value)} /></label>
        <button className="primary" disabled={creating}><Plus />Criar rascunho</button>
      </form>
    </section>

    <section className="panel">
      <h3>Filtros</h3>
      <div className="inventory-create-form">
        <label className="field"><span>Status</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="">Todas</option>
            <option value="DRAFT">Rascunho</option>
            <option value="SENT">Enviada</option>
            <option value="RECEIVED">Recebida</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </label>
      </div>
    </section>

    {error && <div className="auth-error" role="alert">{error}</div>}
    {loading && <div className="empty"><span>Carregando ordens de compra…</span></div>}
    {!loading && orders.length === 0 && <div className="big-empty"><ShoppingCart /><h2>Nenhuma ordem de compra</h2><p>Registre o que pretende comprar de um fornecedor antes da mercadoria chegar.</p></div>}
    {!loading && orders.length > 0 && <section className="inventory-list">
      {orders.map(order => <OrderRow key={order.id} order={order} items={items} onChanged={load} />)}
    </section>}
  </div>;
}

function OrderRow({ order, items, onChanged }: { order: Order; items: InventoryItemOption[]; onChanged: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [establishmentItemId, setEstablishmentItemId] = useState(() => items.find(item => item.configured)?.establishmentItemId ?? "");
  const [quantity, setQuantity] = useState("");
  const [estimatedUnitCost, setEstimatedUnitCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const configuredItems = items.filter(item => item.configured && item.establishmentItemId);
  const isDraft = order.status === "DRAFT";
  const canCancel = order.status === "DRAFT" || order.status === "SENT";
  const canGenerateNote = order.status === "DRAFT" || order.status === "SENT";

  const addItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericQuantity = Number(quantity.replace(",", "."));
    const numericCost = Number(estimatedUnitCost.replace(",", "."));
    if (!establishmentItemId || !Number.isFinite(numericQuantity) || numericQuantity <= 0 || !Number.isFinite(numericCost) || numericCost < 0) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ADD_ITEM", orderId: order.id, establishmentItemId, quantity: numericQuantity, estimatedUnitCost: numericCost }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível adicionar o item.");
      setQuantity(""); setEstimatedUnitCost(""); await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar o item.");
    } finally { setSaving(false); }
  };

  const removeItem = async (itemId: string) => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REMOVE_ITEM", orderId: order.id, itemId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível remover o item.");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover o item.");
    } finally { setSaving(false); }
  };

  const sendOrder = async () => {
    if (order.items.length === 0) { setError("Adicione ao menos um item antes de enviar."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SEND", orderId: order.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível enviar a ordem.");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a ordem.");
    } finally { setSaving(false); }
  };

  const cancelOrder = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CANCEL", orderId: order.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível cancelar a ordem.");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cancelar a ordem.");
    } finally { setSaving(false); }
  };

  const generateNote = async () => {
    if (order.items.length === 0) { setError("Adicione ao menos um item antes de gerar a nota."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/purchase-orders/generate-note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível gerar a nota de entrada.");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar a nota de entrada.");
    } finally { setSaving(false); }
  };

  return <article className="inventory-row">
    <div className="inventory-icon"><ShoppingCart /></div>
    <div className="inventory-identity">
      <small>{order.expectedDate ? new Date(order.expectedDate).toLocaleDateString("pt-BR") : "Sem data prevista"} · {order.supplierName ?? "Sem fornecedor"}</small>
      <strong>{statusLabels[order.status]}</strong>
    </div>
    <div className="inventory-balance"><small>Total estimado</small><strong>{money(orderTotal(order))}</strong></div>
    <div className="inventory-actions">
      <button className="secondary" onClick={() => setExpanded(current => !current)}>{expanded ? "Ocultar itens" : `Ver itens (${order.items.length})`}</button>
      {order.status === "DRAFT" && <button className="secondary" disabled={saving} onClick={() => void sendOrder()}><Send />Enviar</button>}
      {canGenerateNote && <button className="primary" disabled={saving} onClick={() => void generateNote()}><FileOutput />Gerar nota de entrada</button>}
      {canCancel && <button className="link-danger" disabled={saving} onClick={() => void cancelOrder()}><XCircle size={14} />Cancelar</button>}
    </div>
    {expanded && <div className="stock-entry-form">
      <ul className="goods-receipt-items">
        {order.items.length === 0 && <li>Nenhum item adicionado ainda.</li>}
        {order.items.map(item => {
          const inventoryItem = items.find(candidate => candidate.establishmentItemId === item.inventoryItemId);
          return <li key={item.id}>
            <span>{inventoryItem?.name ?? item.inventoryItemId}</span>
            <span>{item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} × {money(item.estimatedUnitCost)}</span>
            <span>{money(item.quantity * item.estimatedUnitCost)}</span>
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
        <label className="field"><span>Custo unitário estimado</span><input inputMode="decimal" value={estimatedUnitCost} onChange={event => setEstimatedUnitCost(event.target.value)} placeholder="R$ 0,00" /></label>
        <button className="primary" disabled={saving || configuredItems.length === 0}><Plus />Adicionar item</button>
      </form>}
      {error && <span className="inline-error">{error}</span>}
    </div>}
  </article>;
}
