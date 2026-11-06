"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, CircleDollarSign, Plus, RefreshCw, Search, Settings2, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addDays, businessDay, cents, type buildFinanceOverview } from "@/lib/finance-ledger";
import styles from "./finance-workspace.module.css";

type Overview = ReturnType<typeof buildFinanceOverview> & { unconfiguredPosPayments?: number; unconfiguredPosRefunds?: number };
type Category = { id: string; name: string; kind: "INCOME" | "EXPENSE"; active: boolean };
type Account = { id: string; name: string; active: boolean; initialBalance: string | number; balanceAsOf: string | null };
type Entry = { sourcePayment?: { sale: { status: string } } | null; sourcePaymentId?: string | null; sourceRefundPaymentId?: string | null; reversalOfId?: string | null; voidedAt?: string | null; grossAmount?: string | number | null; feeAmount?: string | number | null; feeRateSnapshot?: string | number | null; sourceLabel?: string | null; id: string; description: string; categoryId: string; amount: string | number; dueDate: string; paidAt: string | null; bankAccountId: string | null; status: "PENDING" | "PAID"; notes: string | null; reconciled: boolean; supplierId: string | null };
type Data = { entries: Entry[]; categories: Category[]; bankAccounts: Account[]; suppliers: { id: string; name: string; active: boolean }[] };
type Tab = "overview" | "expenses" | "income" | "forecast" | "settings";
export type FinanceProps = { activeEstablishmentId: string; canManageFinance: boolean; canManageFinanceEntries: boolean; canViewFinanceCashflow: boolean; canManageSettlements: boolean };
const formatMoney = (value: number | null) => value === null ? "A conferir" : (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const blankData: Data = { entries: [], categories: [], bankAccounts: [], suppliers: [] };
const newForm = () => ({ description: "", amount: "", dueDate: businessDay(), categoryId: "", bankAccountId: "", supplierId: "", notes: "" });

export function FinanceWorkspace(props: FinanceProps & { settings: ReactNode }) {
  const { canManageFinance, canManageFinanceEntries, canViewFinanceCashflow } = props;
  const [tab, setTab] = useState<Tab>(canViewFinanceCashflow ? "overview" : canManageFinanceEntries ? "expenses" : "settings");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [data, setData] = useState<Data>(blankData);
  const [days, setDays] = useState("30");
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("pending");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editor, setEditor] = useState<string | null>(null);
  const [form, setForm] = useState(newForm);
  const [busy, setBusy] = useState(false);
  const [settling, setSettling] = useState<Entry | null>(null);
  const [settleAccount, setSettleAccount] = useState("");
  const [paidDate, setPaidDate] = useState(businessDay());
  const [detailDay, setDetailDay] = useState("");
  const [baseline, setBaseline] = useState<Account | null>(null);
  const [baselineValue, setBaselineValue] = useState("");
  const [baselineDate, setBaselineDate] = useState(businessDay());
  const [setupAccounts, setSetupAccounts] = useState<Account[]>([]);
  const requestNumber = useRef(0);
  const createKey = useRef("");
  const today = overview?.today ?? businessDay();
  const kind = tab === "income" ? "INCOME" : "EXPENSE";
  const load = useCallback(async () => {
    const sequence = ++requestNumber.current;
    setLoading(true); setError("");
    const get = async (url: string) => { const response = await fetch(url, { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o financeiro."); return body; };
    try {
      const [nextOverview, nextData, accounts] = await Promise.all([
        canViewFinanceCashflow ? get(`/api/admin/finance/overview?days=${days}${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ""}`) : null,
        canManageFinanceEntries ? get("/api/admin/finance/entries") : blankData,
        canManageFinance ? get("/api/admin/finance/bank-accounts") : { accounts: [] },
      ]);
      if (sequence === requestNumber.current) { setOverview(nextOverview); setData(nextData); setSetupAccounts(accounts.accounts); }
    } catch (cause) { if (sequence === requestNumber.current) { setOverview(null); setData(blankData); setError(cause instanceof Error ? cause.message : "Não foi possível carregar o financeiro."); } }
    finally { if (sequence === requestNumber.current) setLoading(false); }
  }, [days, accountId, canViewFinanceCashflow, canManageFinanceEntries, canManageFinance]);
  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled) void load(); }); return () => { cancelled = true; }; }, [load]);
  useEffect(() => {
    if (!settling && !baseline) return;
    const previous = document.activeElement as HTMLElement | null;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { setSettling(null); setBaseline(null); }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector('[role="dialog"]');
      const focusable = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handle);
    return () => { document.removeEventListener("keydown", handle); previous?.focus(); };
  }, [settling, baseline, busy]);
  const send = async (url: string, body: object, method = "PATCH") => {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar."); return result;
  };
  async function mutate(action: () => Promise<unknown>, success: string) {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try { await action(); setEditor(null); setSettling(null); setBaseline(null); setMessage(success); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  function openNew() { setForm(newForm()); createKey.current = crypto.randomUUID(); setEditor("new"); setMessage(""); }
  function changeTab(next: Tab) { if (tab === "settings") void load(); setTab(next); setEditor(null); setSettling(null); setDetailDay(""); setQuery(""); setFrom(""); setTo(""); setStatus("pending"); }
  const category = (id: string) => data.categories.find(c => c.id === id);
  const accountName = (id: string | null) => data.bankAccounts.find(a => a.id === id)?.name ?? "Sem conta definida";
  const accounts = data.bankAccounts.length ? data.bankAccounts : setupAccounts.length ? setupAccounts : overview?.accountBalances ?? [];
  const filteredEntries = data.entries.filter(e => category(e.categoryId)?.kind === kind && (!accountId || e.bankAccountId === accountId) && (!query || `${e.description} ${category(e.categoryId)?.name ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))))
    .filter(e => !from || e.dueDate.slice(0, 10) >= from).filter(e => !to || e.dueDate.slice(0, 10) <= to)
    .filter(e => status === "voided" ? Boolean(e.voidedAt) : !e.voidedAt && (status === "all" || (status === "paid" ? e.status === "PAID" : e.status === "PENDING" && (status === "overdue" ? e.dueDate.slice(0, 10) < today : status === "week" ? e.dueDate.slice(0, 10) >= today && e.dueDate.slice(0, 10) <= addDays(today, 6) : true))));
  const editingSource = data.entries.find(e => e.id === editor);
  const lockedOrigin = Boolean(editingSource?.sourcePaymentId || editingSource?.sourceRefundPaymentId || editingSource?.reversalOfId);
  const listTotal = filteredEntries.reduce((sum, e) => sum + cents(e.amount), 0);
  const selectedDaily = overview?.daily.find(day => day.date === detailDay);
  function beginSettlement(entry: Entry) { setSettling(entry); setSettleAccount(entry.bankAccountId ?? ""); setPaidDate(entry.paidAt ? businessDay(entry.paidAt) : today); }
  function editEntry(entry: Entry) { setEditor(entry.id); setForm({ description: entry.description, amount: String(entry.amount), dueDate: entry.dueDate.slice(0, 10), categoryId: entry.categoryId, bankAccountId: entry.bankAccountId ?? "", supplierId: entry.supplierId ?? "", notes: entry.notes ?? "" }); }
  const panel = (title: string, content: ReactNode) => <section className={styles.panel}><h3>{title}</h3>{content}</section>;

  return <div className={styles.workspace}>
    <div className={styles.heading}><div><span className={styles.kicker}>GESTÃO DO ESTABELECIMENTO</span><h2>Financeiro</h2><p>Dinheiro registrado, compromissos e próximos passos.</p></div><button type="button" className="secondary" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={16} />Atualizar</button></div>
    <nav className={styles.tabs} aria-label="Financeiro">
      {canViewFinanceCashflow && <button type="button" aria-pressed={tab === "overview"} onClick={() => changeTab("overview")}><CircleDollarSign size={18} />Visão geral</button>}
      {canManageFinanceEntries && <><button type="button" aria-pressed={tab === "expenses"} onClick={() => changeTab("expenses")}><ArrowUpRight size={18} />Contas a pagar</button><button type="button" aria-pressed={tab === "income"} onClick={() => changeTab("income")}><ArrowDownLeft size={18} />Contas a receber</button></>}
      {canViewFinanceCashflow && <button type="button" aria-pressed={tab === "forecast"} onClick={() => changeTab("forecast")}><CalendarDays size={18} />Previsão de caixa</button>}
      <button type="button" aria-pressed={tab === "settings"} onClick={() => changeTab("settings")}><Settings2 size={18} />Cadastros e conferência</button>
    </nav>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {message && <div role="status" className={styles.success}>{message}</div>}
    {tab !== "settings" && <div className={styles.toolbar}><label>Conta<select value={accountId} disabled={loading || busy} onChange={e => { setAccountId(e.target.value); setDetailDay(""); }}><option value="">Todas as contas</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}{!a.active ? " (inativa)" : ""}</option>)}</select></label>{(tab === "overview" || tab === "forecast") && <label>Previsão<select value={days} onChange={e => { setDays(e.target.value); setDetailDay(""); }}>{[7, 15, 30, 60, 90].map(n => <option key={n} value={n}>{n} dias</option>)}</select></label>}</div>}
    {loading ? <p className={styles.empty} role="status">Atualizando os números…</p> : <>
      {(tab === "overview" || tab === "forecast") && overview && <>
        {((overview.unconfiguredPosPayments ?? 0) + (overview.unconfiguredPosRefunds ?? 0)) > 0 && <div className={styles.warning}><strong>Recebimentos do PDV aguardando configuração</strong><p>{overview.unconfiguredPosPayments ?? 0} pagamento(s) e {overview.unconfiguredPosRefunds ?? 0} reembolso(s) ainda não entram nestes números. Configure as regras e processe as pendências em Cadastros e conferência → Recebimentos do PDV.</p></div>}
        <div className={styles.cards}>
          <div className={styles.card}><span>Saldo registrado hoje</span><strong>{formatMoney(overview.balanceCents)}</strong><small>Saldos iniciais datados + baixas registradas</small></div>
          <div className={styles.card}><span>A receber na previsão</span><strong>{formatMoney(overview.incomeCents)}</strong><small>Recebíveis vencidos ficam separados</small></div>
          <div className={styles.card}><span>A pagar na previsão</span><strong>{formatMoney(overview.expenseCents)}</strong><small>Inclui contas já vencidas</small></div>
          <div className={styles.card}><span>Saldo previsto em {dateLabel(overview.end)}</span><strong className={(overview.projectedBalanceCents ?? 0) < 0 ? styles.negative : undefined}>{formatMoney(overview.projectedBalanceCents)}</strong><small>Se os compromissos cadastrados se realizarem</small></div>
        </div>
        {overview.balanceCents === null && <div className={styles.warning}><strong>Confira a base antes de usar o saldo</strong><p>{!overview.accountBalances.length ? "Cadastre ao menos uma conta com saldo inicial e data de referência." : `${overview.unknownAccounts} conta(s) sem saldo datado válido; ${overview.unassignedPaid} baixa(s) sem conta; ${overview.missingPaidDate + overview.futurePaid} baixa(s) com data a corrigir.`} A previsão de entradas e saídas continua disponível, mas o saldo total fica em aberto.</p>{canManageFinance && <button type="button" className="secondary" onClick={() => changeTab("settings")}>Conferir saldos iniciais</button>}</div>}
        <div className={styles.scope}><strong>O que compõe estes números</strong><p>Contas e lançamentos financeiros, incluindo pagamentos do PDV integrados pelas regras configuradas. A taxa já é descontada do recebível: não lance essa mesma taxa como despesa novamente. Cartões entram no saldo realizado após confirmar o repasse. Acertos, suprimentos/sangrias e vendas de salão/delivery não são integrados nesta etapa. Este saldo não é uma consulta ao banco.</p><details><summary>Regras da previsão</summary><p>Contas a pagar vencidas entram hoje. Recebíveis vencidos ficam fora da projeção até você atualizar o vencimento. Não estimamos novas vendas. Transferências internas não devem ser cadastradas como receita ou despesa.</p></details></div>
        {tab === "overview" && <div className={styles.twoColumns}>
          {panel("Prioridades", <><div className={styles.priority}><div><span>Pagamentos vencidos</span><strong>{formatMoney(overview.overdueExpenseCents)}</strong></div>{canManageFinanceEntries && <button type="button" className="secondary" onClick={() => { changeTab("expenses"); setStatus("overdue"); }}>Ver contas</button>}</div><div className={styles.priority}><div><span>Recebimentos atrasados</span><strong>{formatMoney(overview.overdueIncomeCents)}</strong></div>{canManageFinanceEntries && <button type="button" className="secondary" onClick={() => { changeTab("income"); setStatus("overdue"); }}>Cobrar ou reagendar</button>}</div><div className={styles.priority}><span>Menor saldo projetado</span><strong className={(overview.lowestBalanceCents ?? 0) < 0 ? styles.negative : undefined}>{formatMoney(overview.lowestBalanceCents)}</strong></div>{overview.unassignedPending > 0 && <p className={styles.note}>{overview.unassignedPending} compromisso(s) ainda sem conta definida. Entram somente na previsão de todas as contas.</p>}</>)}
          {panel("Realizado neste mês", <><div className={styles.priority}><span>Recebido</span><strong>{formatMoney(overview.receivedMonthCents)}</strong></div><div className={styles.priority}><span>Pago</span><strong>{formatMoney(overview.paidMonthCents)}</strong></div><p className={styles.note}>Valores pela data efetiva da baixa, mesmo quando o vencimento foi em outro mês.</p><h4>Saldo por conta</h4>{overview.accountBalances.map(a => <div className={styles.priority} key={a.id}><span>{a.name}{!a.active && " (inativa)"}<small>{a.balanceAsOf ? `Base: início de ${dateLabel(a.balanceAsOf)}` : "Data inicial não informada"}</small></span><strong>{formatMoney(a.balanceCents)}</strong></div>)}</>)}
        </div>}
        {panel("Evolução prevista do saldo", <>{overview.balanceCents !== null ? <div className={styles.chart} role="img" aria-label={`Saldo projetado de ${formatMoney(overview.balanceCents)} para ${formatMoney(overview.projectedBalanceCents)}. Valores diários disponíveis abaixo.`}><ResponsiveContainer width="100%" height={260}><LineChart data={[{ date: "Saldo atual", balanceCents: overview.balanceCents }, ...overview.daily]} margin={{ left: 5, right: 15, top: 12, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={v => v === "Saldo atual" ? v : dateLabel(v).slice(0, 5)} minTickGap={40} /><YAxis width={80} tick={{ fontSize: 12 }} tickFormatter={v => (Number(v) / 100).toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })} /><Tooltip formatter={v => [formatMoney(Number(v)), "Saldo previsto"]} labelFormatter={v => v === "Saldo atual" ? v : dateLabel(String(v))} /><ReferenceLine y={0} stroke="#ba5444" /><Line type="linear" dataKey="balanceCents" stroke="#173f35" strokeWidth={3} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <p className={styles.empty}>O gráfico aparece após conferir os saldos iniciais e as baixas.</p>}<button type="button" className="secondary" onClick={() => setTab(tab === "forecast" ? "overview" : "forecast")}>{tab === "forecast" ? "Voltar à visão geral" : "Explorar previsão por dia"}</button></>)}
        {tab === "forecast" && panel("Previsão diária", <><div className={styles.tableWrap}><table><thead><tr><th>Data</th><th>A receber</th><th>A pagar</th><th>Saldo previsto</th><th>Origem</th></tr></thead><tbody>{overview.daily.map(day => <tr key={day.date}><td>{dateLabel(day.date)}</td><td>{formatMoney(day.incomeCents)}</td><td>{formatMoney(day.expenseCents)}</td><td className={(day.balanceCents ?? 0) < 0 ? styles.negative : undefined}>{formatMoney(day.balanceCents)}</td><td><button type="button" className="secondary" disabled={!day.entryIds.length} onClick={() => setDetailDay(day.date)}>{day.entryIds.length} lançamento(s)</button></td></tr>)}</tbody></table></div>{selectedDaily && <div className={styles.detail}><h4>Compromissos de {dateLabel(selectedDaily.date)}</h4>{canManageFinanceEntries ? data.entries.filter(e => selectedDaily.entryIds.includes(e.id)).map(e => <div className={styles.priority} key={e.id}><span>{e.description}<small>{category(e.categoryId)?.kind === "INCOME" ? "Receber" : "Pagar"} · vencimento {dateLabel(e.dueDate)}</small></span><strong>{formatMoney(cents(e.amount))}</strong><button className="secondary" type="button" onClick={() => beginSettlement(e)}>Registrar baixa</button></div>) : <p>Você pode consultar os totais; a edição dos lançamentos exige permissão de gestão financeira.</p>}</div>}</>)}
      </>}
      {(tab === "expenses" || tab === "income") && canManageFinanceEntries && <>
        <div className={styles.toolbar}><label className={styles.search}><Search size={17} /><input aria-label="Buscar lançamento" type="search" placeholder="Descrição ou categoria" value={query} onChange={e => setQuery(e.target.value)} /></label><label>Situação<select value={status} onChange={e => setStatus(e.target.value)}><option value="pending">Em aberto</option><option value="overdue">Vencidas</option><option value="week">Próximos 7 dias</option><option value="paid">{kind === "INCOME" ? "Recebidas" : "Pagas"}</option><option value="voided">Anuladas pelo PDV</option><option value="all">Todas não anuladas</option></select></label><button type="button" className="primary" disabled={busy} onClick={openNew}><Plus size={17} />{kind === "INCOME" ? "Nova conta a receber" : "Nova conta a pagar"}</button></div>
        <div className={styles.toolbar}><label>Vencimento de<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Até<input type="date" min={from || undefined} value={to} onChange={e => setTo(e.target.value)} /></label><span>{filteredEntries.length} lançamento(s) · <strong>{formatMoney(listTotal)}</strong></span><button type="button" className="secondary" onClick={() => { setFrom(""); setTo(""); setQuery(""); setStatus("pending"); }}>Limpar filtros</button></div>
        {editor && <section className={styles.panel}><div className={styles.heading}><h3>{editor === "new" ? kind === "INCOME" ? "Nova conta a receber" : "Nova conta a pagar" : "Editar lançamento"}</h3><button type="button" className="secondary" aria-label="Fechar lançamento" onClick={() => setEditor(null)}><X size={18} /></button></div><form onSubmit={e => { e.preventDefault(); const body = { ...form, amount: form.amount.replace(",", "."), bankAccountId: form.bankAccountId || null, supplierId: form.supplierId || null, notes: form.notes || null }; void mutate(() => send("/api/admin/finance/entries", editor === "new" ? { ...body, idempotencyKey: createKey.current } : lockedOrigin ? { entryId: editor, dueDate: form.dueDate, bankAccountId: form.bankAccountId || null, notes: form.notes || null } : { ...body, entryId: editor }, editor === "new" ? "POST" : "PATCH"), "Lançamento salvo."); }}>
          <div className={styles.fields}><label>Descrição<input disabled={lockedOrigin} required minLength={2} maxLength={200} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label><label>Valor líquido (R$)<input disabled={lockedOrigin} required inputMode="decimal" placeholder="0,00" pattern="[0-9]+([.,][0-9]{1,2})?" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label><label>Vencimento<input required type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></label><label>Categoria<select disabled={lockedOrigin} required value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}><option value="">Selecione</option>{data.categories.filter(c => c.kind === kind && c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Conta prevista<select value={form.bankAccountId} onChange={e => setForm({ ...form, bankAccountId: e.target.value })}><option value="">Definir ao registrar a baixa</option>{data.bankAccounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{kind === "EXPENSE" && <label>Fornecedor<select disabled={lockedOrigin} value={form.supplierId} onChange={e => setForm({ ...form, supplierId: e.target.value })}><option value="">Não informado</option>{data.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}<label>Observações<input maxLength={500} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label></div>
          {!data.categories.some(c => c.kind === kind && c.active) && <p className={styles.warning}>Cadastre uma categoria de {kind === "INCOME" ? "receita" : "despesa"} em Cadastros e conferência antes de continuar.</p>}<div className={styles.actions}><button className="primary" disabled={busy}>Salvar lançamento</button><button type="button" className="secondary" onClick={() => setEditor(null)}>Cancelar</button></div>
        </form></section>}
        <section className={styles.panel}>{!filteredEntries.length ? <p className={styles.empty}>Nenhuma conta neste filtro.</p> : <div className={styles.entryList}>{filteredEntries.map(entry => <article className={styles.entry} key={entry.id}><div><strong>{entry.description}</strong>{entry.sourcePaymentId && <small>{entry.sourceLabel} · Bruto {formatMoney(cents(entry.grossAmount ?? entry.amount))} · Taxa {formatMoney(cents(entry.feeAmount ?? 0))} ({String(entry.feeRateSnapshot ?? 0)}%) · Líquido {formatMoney(cents(entry.amount))}</small>}{entry.sourceRefundPaymentId && <small>Reembolso automático · confira a devolução das taxas com a adquirente</small>}<small>{category(entry.categoryId)?.name ?? "Categoria inativa"} · {accountName(entry.bankAccountId)}</small><small>Vence em {dateLabel(entry.dueDate)}{entry.paidAt && ` · baixa em ${dateLabel(businessDay(entry.paidAt))}`}</small></div><span className={entry.status === "PENDING" && entry.dueDate.slice(0, 10) < today ? styles.overdue : styles.badge}>{entry.voidedAt ? "Anulada pelo PDV" : entry.status === "PAID" ? kind === "INCOME" ? "Recebida" : "Paga" : entry.dueDate.slice(0, 10) < today ? "Vencida" : "Em aberto"}</span><strong>{formatMoney(cents(entry.amount))}</strong><div className={styles.entryActions}>{!entry.reconciled && !entry.voidedAt && entry.sourcePayment?.sale.status !== "CANCELLED" && <><button type="button" className="secondary" disabled={busy} onClick={() => beginSettlement(entry)}>{entry.status === "PAID" ? "Corrigir baixa" : kind === "INCOME" ? "Receber" : "Pagar"}</button>{entry.status === "PENDING" ? <button type="button" className="secondary" disabled={busy} onClick={() => editEntry(entry)}>Editar</button> : <button type="button" className="secondary" disabled={busy} onClick={() => { if (window.confirm("Reabrir esta conta? A baixa será retirada do saldo registrado e a conta voltará para as pendências.")) void mutate(() => send("/api/admin/finance/entries", { entryId: entry.id, status: "PENDING" }), "Conta reaberta."); }}>Reabrir</button>}</>}{entry.sourcePayment?.sale.status === "CANCELLED" && !entry.voidedAt && <small>Venda cancelada · original preservado com estorno</small>}{entry.reconciled && <small>Conciliada · desfaça a conciliação para editar</small>}</div></article>)}</div>}</section>
      </>}
      {tab === "settings" && <>{canManageFinance && panel("Saldos de referência", <><p className={styles.note}>Informe quanto havia em cada conta no início da data escolhida. Baixas anteriores já devem estar incorporadas nesse valor. A partir dessa data, o sistema soma apenas as baixas registradas.</p>{setupAccounts.map(a => <div className={styles.priority} key={a.id}><span>{a.name}<small>{a.balanceAsOf ? `Saldo inicial de ${dateLabel(a.balanceAsOf)}` : "Data de referência pendente"}</small></span><strong>{formatMoney(cents(a.initialBalance))}</strong><button className="secondary" type="button" onClick={() => { setBaseline(a); setBaselineValue(String(a.initialBalance)); setBaselineDate(a.balanceAsOf?.slice(0, 10) ?? today); }}>Conferir saldo</button></div>)}{!setupAccounts.length && <p>Cadastre uma conta abaixo e depois confira o saldo de referência.</p>}</>)}{props.settings}</>}
    </>}
    {settling && <div className={styles.overlay}><section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Registrar baixa"><h3>{settling.status === "PAID" ? "Corrigir baixa" : "Registrar baixa"}</h3><p>{settling.description} · {formatMoney(cents(settling.amount))}</p><p className={styles.note}>Esta ação registra um pagamento ou recebimento já realizado. Não movimenta dinheiro no banco.</p><form onSubmit={e => { e.preventDefault(); void mutate(() => send("/api/admin/finance/entries", { entryId: settling.id, status: "PAID", bankAccountId: settleAccount, paidDate }), "Baixa registrada. Saldo e previsão atualizados."); }}><div className={styles.fields}><label>Conta da baixa<select required autoFocus value={settleAccount} onChange={e => setSettleAccount(e.target.value)}><option value="">Selecione</option>{data.bankAccounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Data efetiva<input required type="date" max={today} value={paidDate} onChange={e => setPaidDate(e.target.value)} /></label></div>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button className="primary" disabled={busy}>Confirmar baixa</button><button className="secondary" type="button" disabled={busy} onClick={() => setSettling(null)}>Cancelar</button></div></form></section></div>}
    {baseline && <div className={styles.overlay}><section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Conferir saldo inicial"><h3>{baseline.name}</h3><p>Saldo no início do dia, antes das movimentações desse dia. Este valor será a base dos cálculos.</p><form onSubmit={e => { e.preventDefault(); void mutate(() => send("/api/admin/finance/bank-accounts", { accountId: baseline.id, initialBalance: baselineValue.replace(",", "."), balanceAsOf: baselineDate }), "Saldo de referência salvo."); }}><div className={styles.fields}><label>Saldo inicial (R$)<input autoFocus required inputMode="decimal" pattern="-?[0-9]+([.,][0-9]{1,2})?" value={baselineValue} onChange={e => setBaselineValue(e.target.value)} /></label><label>Data de referência<input required type="date" max={today} value={baselineDate} onChange={e => setBaselineDate(e.target.value)} /></label></div>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button className="primary" disabled={busy}>Salvar saldo de referência</button><button className="secondary" type="button" disabled={busy} onClick={() => setBaseline(null)}>Cancelar</button></div></form></section></div>}
  </div>;
}
