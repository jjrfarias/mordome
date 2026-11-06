"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { businessDay, cents, decimal } from "@/lib/finance-ledger";
import s from "./daily-receipts.module.css";

type Entry = { sourcePayment: { sale: { status: string } } | null; id: string; description: string; amount: string; grossAmount: string | null; feeAmount: string | null; sourceLabel: string | null; dueDate: string; paidAt: string | null; status: string; bankAccountId: string | null; reconciled: boolean; receiptBatchId: string | null; updatedAt: string };
type Batch = { id: string; expectedAmount: string; receivedAmount: string; differenceAmount: string; bankAccountId: string; receivedDate: string; status: string; reason: string | null; reversalReason: string | null; createdBy: { name: string }; reversedBy: { name: string } | null; items: { entryId: string; description: string; expectedAmount: string }[] };
type Data = { entries: Entry[]; total: number; bankAccounts: { id: string; name: string; active: boolean }[]; batches: Batch[]; pendingCents: number; receivedCents: number; differenceCents: number };
const money = (n: number) => (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const amountCents = (value: string) => { try { return cents(value.replace(",", ".")); } catch { return null; } };

export default function DailyReceipts() {
  const [date, setDate] = useState(businessDay());
  const [bank, setBank] = useState("");
  const [overdue, setOverdue] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState("");
  const [received, setReceived] = useState("");
  const [paidDate, setPaidDate] = useState(businessDay());
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reversing, setReversing] = useState<Batch | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const sequence = useRef(0), key = useRef("");
  const dialog = useRef<HTMLDivElement>(null);
  const today = businessDay();
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true); setError(""); setSelected([]);
    try {
      const response = await fetch(`/api/admin/finance/daily-receipts?date=${date}&overdue=${overdue}&bankAccountId=${encodeURIComponent(bank)}`, { cache: "no-store" });
      const next = await response.json(); if (!response.ok) throw new Error(next.error);
      if (seq === sequence.current) setData(next);
    } catch (e) { if (seq === sequence.current) { setData(null); setError(e instanceof Error ? e.message : "Não foi possível carregar."); } }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [date, bank, overdue]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; }; }, [load]);
  useEffect(() => {
    if (!confirm && !reversing) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { setConfirm(false); setReversing(null); }
      if (e.key !== "Tab") return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [confirm, reversing, busy]);
  const selectedEntries = data?.entries.filter(e => selected.includes(e.id)) ?? [];
  const expected = selectedEntries.reduce((sum, e) => sum + cents(e.amount), 0);
  const actual = amountCents(received);
  const difference = actual === null ? null : actual - expected;
  const bankName = (id: string | null) => data?.bankAccounts.find(b => b.id === id)?.name ?? "Sem conta definida";
  const eligible = (e: Entry) => !e.reconciled && !e.receiptBatchId && e.sourcePayment?.sale.status !== "CANCELLED";
  function select(ids: string[]) {
    const rows = data!.entries.filter(e => ids.includes(e.id));
    setSelected(ids); setReceived(decimal(rows.reduce((sum, e) => sum + cents(e.amount), 0))); setReason("");
    setDestination(rows.find(e => e.bankAccountId)?.bankAccountId ?? bank); key.current = crypto.randomUUID();
    setPaidDate(date > today ? today : date); setMessage("");
  }
  async function submit(reverse = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const body = reverse ? { batchId: reversing!.id, reason: undoReason } : { idempotencyKey: key.current, entries: selectedEntries.map(e => ({ id: e.id, updatedAt: e.updatedAt })), bankAccountId: destination, receivedDate: paidDate, receivedAmount: decimal(actual!), reason };
      const response = await fetch("/api/admin/finance/daily-receipts", { method: reverse ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setConfirm(false); setReversing(null); setMessage(reverse ? "Lote desfeito. Os recebimentos voltaram à situação anterior." : "Recebimentos baixados e conciliados. O saldo considera o valor recebido.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  }
  const available = data?.entries.filter(eligible) ?? [];
  const selectedBank = selectedEntries.find(e => e.bankAccountId)?.bankAccountId;
  const candidates = available.filter(e => !selectedBank || !e.bankAccountId || e.bankAccountId === selectedBank);
  const candidateBanks = new Set(candidates.map(e => e.bankAccountId).filter(Boolean));
  const canSelectAll = candidateBanks.size <= 1 && candidates.length > 0 && candidates.length <= 200;
  const valid = selected.length > 0 && destination && actual !== null && actual >= 0 && actual <= 999999999999 && expected <= 999999999999 && paidDate && paidDate <= today && (difference === 0 || reason.trim());
  return <section className={s.workspace}>
    <div className={s.heading}><div><h3>Recebimentos do dia</h3><p>Confira o depósito, selecione os recebíveis e confirme o valor que entrou.</p></div><button className="secondary" onClick={() => void load()} disabled={loading || busy}>Atualizar recebimentos</button></div>
    <div className={s.filters}>
      <label>Dia de referência<input type="date" value={date} disabled={busy} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></label>
      <label>Conta<select aria-label="Conta" value={bank} disabled={busy} onChange={e => setBank(e.target.value)}><option value="">Todas as contas</option>{data?.bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.active ? "" : " (inativa)"}</option>)}</select></label>
      <label className={s.check}><input type="checkbox" checked={overdue} disabled={busy} onChange={e => setOverdue(e.target.checked)} />Incluir atrasados</label>
    </div>
    {error && !confirm && !reversing && <p role="alert" className={s.error}>{error}</p>}
    {message && <p role="status" className={s.success}>{message}</p>}
    {loading ? <p role="status">Carregando recebimentos…</p> : data && <>
      <div className={s.cards}><article><span>Aguardando recebimento</span><strong>{money(data.pendingCents)}</strong><small>Previstos para {dateLabel(date)}{overdue ? " e atrasados" : ""}</small></article><article><span>Recebido registrado no dia</span><strong>{money(data.receivedCents)}</strong><small>Baixas de receitas + diferenças dos lotes</small></article><article><span>Diferença conciliada no dia</span><strong className={data.differenceCents < 0 ? s.negative : undefined}>{money(data.differenceCents)}</strong><small>Recebido menos previsto, nos lotes ativos</small></article></div>
      <p className={s.note}>Conferência manual com o extrato. O previsto já desconta as taxas configuradas. Uma diferença gera um ajuste no lote; não altera a taxa nem distribui valores arbitrários entre vendas. Estornos e despesas são conferidos em Contas a pagar.</p>
      <div className={s.panel}><div className={s.heading}><h4>Recebíveis para conferir <small>({data.total})</small></h4><button className="secondary" disabled={!selected.length || busy} onClick={() => select([])}>Limpar seleção</button></div>
        {data.total > data.entries.length && <p className={s.note}>Exibindo os primeiros {data.entries.length} de {data.total}. Filtre por conta ou desmarque os atrasados. Totais consideram todos os resultados.</p>}
        <p className={s.note}>Selecione até 200 recebimentos da mesma conta por lote.{candidateBanks.size > 1 ? " Filtre por conta ou selecione o primeiro recebimento para usar a seleção em lote." : ""}</p>
        <div className={s.tableWrap}><table><thead><tr><th><input type="checkbox" aria-label="Selecionar todos os recebimentos disponíveis" disabled={!canSelectAll || busy} checked={canSelectAll && candidates.every(e => selected.includes(e.id))} onChange={e => select(e.target.checked ? candidates.map(x => x.id) : [])} /></th><th>Recebimento</th><th>Conta / previsão</th><th>Bruto / taxa</th><th>Previsto líquido</th><th>Situação</th></tr></thead><tbody>
          {data.entries.map(e => <tr key={e.id} className={selected.includes(e.id) ? s.selected : undefined}><td><input type="checkbox" aria-label={`Selecionar ${e.description}`} checked={selected.includes(e.id)} disabled={busy || !eligible(e) || (!selected.includes(e.id) && (selected.length >= 200 || Boolean(selectedBank && e.bankAccountId && selectedBank !== e.bankAccountId)))} onChange={event => select(event.target.checked ? [...selected, e.id] : selected.filter(id => id !== e.id))} /></td><td data-label="Recebimento"><strong>{e.description}</strong><small>{e.sourceLabel ?? "Lançamento manual"}</small></td><td data-label="Conta / previsão">{bankName(e.bankAccountId)}<small>{dateLabel(e.dueDate)}{e.status === "PENDING" && e.dueDate.slice(0, 10) < date ? " · Atrasado" : ""}</small></td><td data-label="Bruto / taxa">{e.grossAmount !== null ? money(cents(e.grossAmount)) : "—"}<small>{e.feeAmount !== null ? `Taxa ${money(cents(e.feeAmount))}` : ""}</small></td><td data-label="Previsto líquido" className={s.amount}>{money(cents(e.amount))}</td><td data-label="Situação"><span className={s.badge}>{e.sourcePayment?.sale.status === "CANCELLED" ? "Venda cancelada · ver estorno" : e.receiptBatchId ? "Conciliado em lote" : e.reconciled ? "Conciliado" : e.status === "PAID" ? "Baixado · conferir" : "A receber"}</span></td></tr>)}
          {!data.entries.length && <tr><td colSpan={6} className={s.empty}>Nenhum recebimento para os filtros escolhidos.</td></tr>}
        </tbody></table></div>
      </div>
      {selected.length > 0 && <div className={s.batch}><div className={s.heading}><h4>Conferir {selected.length} recebimento(s)</h4><strong>Previsto: {money(expected)}</strong></div><div className={s.filters}>
        <label>Conta que recebeu<select aria-label="Conta que recebeu" value={destination} disabled={busy} onChange={e => { setDestination(e.target.value); key.current = crypto.randomUUID(); }}><option value="">Selecione a conta</option>{data.bankAccounts.filter(a => a.active && (!selectedBank || a.id === selectedBank)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Data efetiva<input type="date" value={paidDate} max={today} disabled={busy} onChange={e => { setPaidDate(e.target.value); key.current = crypto.randomUUID(); }} /></label>
        <label>Total recebido (R$)<input inputMode="decimal" value={received} disabled={busy} onChange={e => { setReceived(e.target.value); key.current = crypto.randomUUID(); }} /></label>
        <div className={s.delta}><span>Diferença</span><strong className={(difference ?? 0) < 0 ? s.negative : undefined}>{difference === null ? "Valor inválido" : money(difference)}</strong></div>
      </div><label>Motivo da diferença {difference !== 0 ? "(obrigatório)" : "ou observação"}<textarea value={reason} maxLength={1000} disabled={busy} onChange={e => { setReason(e.target.value); key.current = crypto.randomUUID(); }} placeholder="Ex.: desconto adicional identificado no extrato" /></label><p className={s.note}>Itens já baixados serão conciliados, sem duplicar a entrada. Todos os itens passam a usar a data efetiva informada.</p><button className="primary" disabled={!valid || busy} onClick={() => { setError(""); setConfirm(true); }}>Revisar e confirmar lote</button></div>}
      <div className={s.panel}><h4>Histórico de lotes em {dateLabel(date)}</h4><p className={s.note}>Até 50 lotes mais recentes do dia. O valor recebido e a diferença pertencem ao lote completo.</p>{!data.batches.length && <p>Nenhum lote neste dia.</p>}{data.batches.map(b => <details className={s.history} key={b.id}><summary><strong>Lote {b.id.slice(-8)}</strong> · {b.items.length} recebimento(s) · {money(cents(b.receivedAmount))} <span className={s.badge}>{b.status === "ACTIVE" ? "Conciliado" : "Desfeito"}</span></summary><p>{bankName(b.bankAccountId)} · registrado por {b.createdBy.name}</p><p>Previsto: <strong>{money(cents(b.expectedAmount))}</strong> · Recebido: <strong>{money(cents(b.receivedAmount))}</strong> · Diferença: <strong>{money(cents(b.differenceAmount))}</strong></p>{b.reason && <p>Motivo: {b.reason}</p>}<ul>{b.items.map(i => <li key={i.entryId}>{i.description} — previsto {money(cents(i.expectedAmount))}</li>)}</ul>{b.status === "ACTIVE" ? <button className="secondary" disabled={busy} onClick={() => { setReversing(b); setUndoReason(""); setError(""); }}>Desfazer lote</button> : <p>Desfeito por {b.reversedBy?.name}: {b.reversalReason}</p>}</details>)}</div>
    </>}
    {(confirm || reversing) && <div className={s.overlay}><div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="receipt-dialog-title" tabIndex={-1}><h3 id="receipt-dialog-title">{reversing ? "Desfazer conciliação e baixas?" : "Confirmar recebimento do lote?"}</h3>{error && <p className={s.error} role="alert">{error}</p>}{reversing ? <><p>Os {reversing.items.length} recebimentos voltarão à situação anterior e o ajuste da diferença será anulado. O histórico será preservado.</p><label>Justificativa<textarea maxLength={1000} value={undoReason} disabled={busy} onChange={e => setUndoReason(e.target.value)} /></label></> : <><p>{selected.length} recebimento(s) em <strong>{bankName(destination)}</strong>, no dia <strong>{dateLabel(paidDate)}</strong>.</p><dl><dt>Previsto líquido</dt><dd>{money(expected)}</dd><dt>Recebido</dt><dd>{money(actual ?? 0)}</dd><dt>Diferença</dt><dd>{money(difference ?? 0)}</dd></dl>{difference !== 0 && <p>Será registrado um ajuste de {difference! < 0 ? "despesa" : "receita"} de {money(Math.abs(difference!))}. Motivo: {reason}</p>}<p>Esta confirmação registra a conferência feita por você. Não consulta nem movimenta a conta bancária.</p></>}<div className={s.actions}><button className="secondary" disabled={busy} onClick={() => { setConfirm(false); setReversing(null); }}>Voltar</button><button className="primary" disabled={busy || (reversing ? undoReason.trim().length < 3 : !valid)} onClick={() => void submit(Boolean(reversing))}>{busy ? "Salvando…" : reversing ? "Desfazer lote" : "Confirmar baixa e conciliação"}</button></div></div></div>}
  </section>;
}
