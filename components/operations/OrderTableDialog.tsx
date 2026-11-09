"use client";
import { useEffect, useState } from "react";
import { money } from "@/lib/domain";

export function OrderTableDialog({ tables, onClose, onLinked }: { tables: { id: string; number: number }[]; onClose: () => void; onLinked: (tableId: string, tabId: string) => Promise<void> }) {
  const [orders, setOrders] = useState<{ id: string; customerName: string; customerPhone: string; total: number }[]>([]);
  const [orderId, setOrderId] = useState(""); const [tableId, setTableId] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch("/api/operations/order-table", { cache: "no-store" }).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error); setOrders(data.orders); }).catch(cause => setError(cause instanceof Error ? cause.message : "Não foi possível carregar os pedidos.")).finally(() => setLoading(false)); }, []);
  return <div className="modal-bg"><form className="modal" onSubmit={async event => {
    event.preventDefault(); if (saving || !orderId || !tableId) return; setSaving(true); setError("");
    try { const response = await fetch("/api/operations/order-table", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, tableId }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); await onLinked(tableId, data.tabId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível vincular."); } finally { setSaving(false); }
  }}><button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Fechar vínculo à mesa">×</button><h2>Vincular pedido à mesa</h2><p>Selecione o pedido online ou de retirada/entrega. Ele ficará em uma comanda separada com o nome do cliente. A taxa de entrega será retirada e o serviço do salão poderá ser removido no pagamento.</p>
    <label className="field"><span>Pedido do cliente</span><select required value={orderId} onChange={event => setOrderId(event.target.value)} disabled={loading || saving}><option value="">{loading ? "Carregando…" : "Selecione o pedido"}</option>{orders.map(order => <option key={order.id} value={order.id}>{order.customerName} · {order.customerPhone} · {money(order.total)}</option>)}</select></label>
    <label className="field"><span>Mesa</span><select required value={tableId} onChange={event => setTableId(event.target.value)} disabled={saving}><option value="">Selecione a mesa</option>{tables.map(table => <option key={table.id} value={table.id}>Mesa {table.number}</option>)}</select></label>
    {!loading && !orders.length && <p>Nenhum pedido aberto disponível para vincular.</p>}{error && <p role="alert" className="auth-error">{error}</p>}<button className="primary wide" disabled={saving || !orderId || !tableId}>{saving ? "Vinculando…" : "Confirmar vínculo à mesa"}</button>
  </form></div>;
}
