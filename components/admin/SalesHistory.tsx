"use client";

import { useEffect, useState } from "react";
import { Ban, Landmark, X } from "lucide-react";
import { money } from "@/lib/domain";
import { PeriodFilter, toDateInput } from "@/components/admin/PeriodFilter";
import { ReasonSelect } from "@/components/operations/ReasonSelect";

type SaleStatus = "COMPLETED" | "CANCELLED" | "PARTIALLY_REFUNDED" | "REFUNDED";
type SaleRow = { id: string; completedAt: string; channel: string; status: SaleStatus; payment: string; total: number; refunded: number; itemsCount: number };

const CHANNEL_LABELS: Record<string, string> = { POS: "PDV", FLOOR: "Salão", DELIVERY: "Delivery", ONLINE: "Online" };
const STATUS_LABELS: Record<SaleStatus, string> = { COMPLETED: "Concluída", CANCELLED: "Cancelada", PARTIALLY_REFUNDED: "Parcialmente reembolsada", REFUNDED: "Reembolsada" };
const PAYMENT_LABELS: Record<string, string> = { PIX: "Pix", CREDIT_CARD: "Crédito", DEBIT_CARD: "Débito", CASH: "Dinheiro", OTHER: "Outro" };
const paymentLabel = (raw: string) => raw.split(" + ").map(part => PAYMENT_LABELS[part] ?? part).join(" + ");
const REFUND_METHODS = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro"];

// Histórico de vendas para cancelamento/reembolso (ADR 0046): diferente do Histórico geral
// (auditoria, só leitura), esta tela lista vendas do período com ação — pego pela reclamação real
// do cliente de não achar onde cancelar uma venda do PDV. Reaproveita a mesma API de
// Cancelamento/Reembolso já usada pelo Salão/Delivery (`POST /api/operations/sales`), só que
// acessível a partir de qualquer venda de qualquer canal, não só de uma comanda/pedido ativo.
export function SalesHistory({ canCancelSales, canRefundSales }: { canCancelSales: boolean; canRefundSales: boolean }) {
  const today = toDateInput(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelTarget, setCancelTarget] = useState<SaleRow | null>(null);
  const [refundTarget, setRefundTarget] = useState<SaleRow | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/operations/sales?from=${from}&to=${to}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as vendas.");
      setSales(data.sales ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as vendas."); }
    finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [from, to]);

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Vendas</span><h2>Histórico</h2></div></div>
      <p className="section-note">Localize uma venda de qualquer canal (PDV, Salão ou Delivery) para cancelar ou registrar um reembolso.</p>
      <PeriodFilter from={from} to={to} onChange={({ from: nextFrom, to: nextTo }) => { setFrom(nextFrom); setTo(nextTo); }} />
    </section>

    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando vendas…</span></div> : sales.length === 0 ? <section className="panel settings-shell"><div className="empty"><span>Nenhuma venda nesse período.</span></div></section> : <section className="panel settings-table-wrap">
      <div className="settings-table-head">
        <span>Data / canal</span>
        <span>Pagamento</span>
        <span>Status</span>
        <span>Ações</span>
      </div>
      <div className="settings-table-body">
        {sales.map(sale => {
          const remaining = Math.max(0, sale.total - sale.refunded);
          const canAct = sale.status === "COMPLETED" || sale.status === "PARTIALLY_REFUNDED";
          return <article className="settings-row" key={sale.id}>
            <div className="settings-cell">
              <strong>{new Date(sale.completedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</strong>
              <small>{CHANNEL_LABELS[sale.channel] ?? sale.channel} · {sale.itemsCount} item(ns) · {money(sale.total)}</small>
            </div>
            <div className="settings-cell">{paymentLabel(sale.payment) || "—"}</div>
            <div className="settings-cell">
              <span className={`status-pill ${sale.status === "COMPLETED" ? "status-active" : sale.status === "PARTIALLY_REFUNDED" ? "status-warn" : "status-inactive"}`}>{STATUS_LABELS[sale.status]}</span>
              {sale.refunded > 0 && <small>{money(sale.refunded)} reembolsado</small>}
            </div>
            <div className="settings-cell">
              <div className="settings-actions">
                {canAct && canCancelSales && <button type="button" className="secondary warn" onClick={() => setCancelTarget(sale)}><Ban size={14} />Cancelar</button>}
                {canAct && canRefundSales && remaining > 0 && <button type="button" className="secondary" onClick={() => setRefundTarget(sale)}><Landmark size={14} />Reembolsar</button>}
                {!canAct && <span className="section-note">Sem ação disponível</span>}
              </div>
            </div>
          </article>;
        })}
      </div>
    </section>}

    {cancelTarget && <CancelSaleModal sale={cancelTarget} onClose={() => setCancelTarget(null)} onDone={() => { setCancelTarget(null); void load(); }} />}
    {refundTarget && <RefundSaleModal sale={refundTarget} onClose={() => setRefundTarget(null)} onDone={() => { setRefundTarget(null); void load(); }} />}
  </section>;
}

function CancelSaleModal({ sale, onClose, onDone }: { sale: SaleRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CANCEL", saleId: sale.id, reason: reason.trim(), idempotencyKey: crypto.randomUUID() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível cancelar a venda.");
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cancelar a venda."); }
    finally { setSaving(false); }
  };

  return <div className="modal-bg"><div className="modal">
    <button className="modal-close" onClick={onClose}><X /></button>
    <span className="modal-icon cancel"><Ban /></span>
    <h2>Cancelar venda</h2>
    <p>{money(sale.total)} · {new Date(sale.completedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. O estoque consumido é automaticamente reposto (estorno). Essa ação fica registrada no histórico e não pode ser desfeita.</p>
    {error && <div className="auth-error">{error}</div>}
    <ReasonSelect category="SALE_CANCEL" value={reason} onChange={setReason} autoFocus />
    <button className="primary wide" disabled={saving || reason.trim().length < 3} onClick={() => void confirm()}>{saving ? "Cancelando…" : "Confirmar cancelamento"}</button>
  </div></div>;
}

function RefundSaleModal({ sale, onClose, onDone }: { sale: SaleRow; onClose: () => void; onDone: () => void }) {
  const remaining = Math.max(0, sale.total - sale.refunded);
  const [amount, setAmount] = useState(remaining.toFixed(2).replace(".", ","));
  const [method, setMethod] = useState(REFUND_METHODS[0]);
  const [reason, setReason] = useState("");
  const [restoreStock, setRestoreStock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const parsedAmount = Number(amount.replace(",", "."));
  const isTotal = Math.abs(parsedAmount - remaining) < 0.005;
  const valid = parsedAmount > 0 && parsedAmount <= remaining + 0.001 && reason.trim().length >= 3;

  const confirm = async () => {
    if (!valid) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REFUND", saleId: sale.id, amount: parsedAmount, payments: [{ method, amount: parsedAmount }], restoreStock: restoreStock && isTotal, reason: reason.trim(), idempotencyKey: crypto.randomUUID() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível registrar o reembolso.");
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar o reembolso."); }
    finally { setSaving(false); }
  };

  return <div className="modal-bg"><div className="modal">
    <button className="modal-close" onClick={onClose}><X /></button>
    <span className="modal-icon"><Landmark /></span>
    <h2>Reembolsar venda</h2>
    <p>Saldo disponível para reembolso: {money(remaining)}. O caixa aberto no momento recebe a saída correspondente.</p>
    {error && <div className="auth-error">{error}</div>}
    <label>Valor a reembolsar<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" /></label>
    <label>Devolvido via
      <select value={method} onChange={event => setMethod(event.target.value)}>
        {REFUND_METHODS.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
    {isTotal && <label className="check-line"><input type="checkbox" checked={restoreStock} onChange={event => setRestoreStock(event.target.checked)} /> Repor automaticamente o estoque consumido</label>}
    <ReasonSelect category="REFUND" value={reason} onChange={setReason} />
    <button className="primary wide" disabled={saving || !valid} onClick={() => void confirm()}>{saving ? "Registrando…" : `Reembolsar ${money(Math.max(0, parsedAmount || 0))}`}</button>
  </div></div>;
}
