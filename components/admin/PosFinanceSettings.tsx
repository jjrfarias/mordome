"use client";

import { useCallback, useEffect, useState } from "react";
import { posMethods, posMethodLabels } from "@/lib/pos-receipts";
import styles from "./finance-workspace.module.css";

type Rule = { method: string; name: string; bankAccountId: string; feeRate: string | number; settlementDays: number; businessDays: boolean; holidays: string[]; active: boolean };
type Account = { id: string; name: string; active: boolean };
type Payload = { rules: Rule[]; accounts: Account[]; pending: { method: string; count: number; grossCents: number }[]; pendingRefunds: number };

export function PosFinanceSettings() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const load = useCallback(async () => {
    try { const response = await fetch("/api/admin/finance/pos-integration", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a integração."); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  return <section className={styles.panel}>
    <h3>Recebimentos automáticos de vendas</h3>
    <p className={styles.note}>As regras são compartilhadas pelo PDV, salão e delivery da unidade. O recebível nasce ao concluir o pagamento da venda, não ao abrir a comanda ou criar o pedido. Configure uma regra por forma de pagamento e unidade. Use as taxas e os prazos do seu contrato Stone/Ton ou de outra adquirente. Mudanças valem para novos recebíveis e não recalculam os existentes.</p>
    <p className={styles.note}>Dinheiro e Pix com prazo zero entram como recebidos no ato. Cartões geram contas a receber pelo líquido, aguardando confirmação do repasse. Crédito à vista: o checkout ainda não registra parcelamento. Dias úteis consideram segunda a sexta e os feriados que você informar.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.success}>{message}</p>}
    {!data ? <p>Carregando configurações…</p> : <>
      {!data.accounts.some(a => a.active) && <p className={styles.warning}>Cadastre uma conta de destino em Contas bancárias antes de ativar. Para dinheiro físico, use uma conta separada, como Caixa da loja.</p>}
      <div className={styles.twoColumns}>{posMethods.map(method => <RuleForm key={`${method}-${JSON.stringify(data.rules.find(r => r.method === method))}`} method={method} rule={data.rules.find(r => r.method === method)} accounts={data.accounts} onSaved={async () => { setError(""); setMessage("Regra salva. Novas vendas usarão esta configuração."); await load(); }} />)}</div>
      <h4>Pagamentos aguardando configuração</h4>
      <p className={styles.note}>Somente vendas novas: PDV após sua integração; salão e delivery após a ampliação para esses canais. Vendas antigas não são importadas para evitar duplicar lançamentos manuais. Ao processar, as pendências usam as regras atuais; as datas partem do dia original da venda.</p>
      {data.pending.map(p => <div className={styles.priority} key={p.method}><span>{posMethodLabels[p.method]}</span><strong>{p.count} · {(p.grossCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>)}
      {data.pendingRefunds > 0 && <p>{data.pendingRefunds} reembolso(s) também aguardam uma conta de destino.</p>}
      <button type="button" className="primary" disabled={processing || !data.pending.some(p => p.count) && !data.pendingRefunds} onClick={async () => {
        setProcessing(true); setError(""); setMessage("");
        try { const response = await fetch("/api/admin/finance/pos-integration", { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage(`${result.created} lançamento(s) gerado(s). ${result.message}`); await load(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível processar."); } finally { setProcessing(false); }
      }}>{processing ? "Processando…" : "Processar pendências com as regras atuais"}</button>
      <p className={styles.note}>Processamos até 100 vendas por vez. É seguro repetir: pagamentos já integrados não são duplicados. Reembolsos não presumem devolução das taxas pela adquirente.</p>
    </>}
  </section>;
}

function RuleForm({ method, rule, accounts, onSaved }: { method: string; rule?: Rule; accounts: Account[]; onSaved: () => Promise<void> }) {
  const cash = method === "CASH";
  const [form, setForm] = useState({ name: rule?.name ?? (method.includes("CARD") ? "Stone/Ton" : posMethodLabels[method]), bankAccountId: rule?.bankAccountId ?? "", feeRate: rule ? String(rule.feeRate) : cash ? "0" : "", days: rule ? String(rule.settlementDays) : cash || method === "PIX" ? "0" : "", businessDays: rule?.businessDays ?? false, holidays: rule?.holidays.join(", ") ?? "", active: rule?.active ?? true });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className={styles.panel} onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/pos-integration", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, name: form.name, bankAccountId: form.bankAccountId, feeRate: form.feeRate.replace(",", "."), settlementDays: Number(form.days), businessDays: form.businessDays, holidays: [...new Set(form.holidays.split(/[\s,;]+/).filter(Boolean))], active: form.active }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); } finally { setBusy(false); }
  }}>
    <h4>{posMethodLabels[method]}</h4><p className={styles.note}>{rule ? rule.active ? "Integração ativada" : "Integração pausada" : "Aguardando configuração"}</p>
    <div className={styles.fields}>
      <label>Identificação / adquirente<input required maxLength={60} minLength={2} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>Conta de destino<select required aria-label={`Conta de destino ${method}`} value={form.bankAccountId} onChange={e => setForm({ ...form, bankAccountId: e.target.value })}><option value="">Selecione</option>{accounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Taxa (%)<input required disabled={cash} aria-label={`Taxa ${method}`} inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="Taxa do contrato" value={form.feeRate} onChange={e => setForm({ ...form, feeRate: e.target.value })} /></label>
      <label>Prazo de recebimento (dias)<input required disabled={cash} aria-label={`Prazo ${method}`} type="number" min={0} max={365} value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} /></label>
      {!cash && <label>Contagem do prazo<select value={form.businessDays ? "business" : "calendar"} onChange={e => setForm({ ...form, businessDays: e.target.value === "business" })}><option value="calendar">Dias corridos</option><option value="business">Dias úteis</option></select></label>}
      {form.businessDays && <label>Feriados (AAAA-MM-DD, separados por vírgula)<input value={form.holidays} onChange={e => setForm({ ...form, holidays: e.target.value })} placeholder="2026-12-25, 2027-01-01" /></label>}
    </div>
    <label className={styles.note}><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Integrar novos pagamentos automaticamente</label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button className="primary" disabled={busy || !accounts.some(a => a.active)}>{busy ? "Salvando…" : `Salvar ${posMethodLabels[method]}`}</button></div>
  </form>;
}
