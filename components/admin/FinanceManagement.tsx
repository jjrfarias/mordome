import { useEffect, useState } from "react";

type Category = { id: string; name: string; kind: "INCOME" | "EXPENSE"; active: boolean };
type BankAccount = { id: string; name: string; bank: string; agency: string | null; accountNumber: string | null; initialBalance: number | string; active: boolean };
type PaymentMethodConfig = { id: string; name: string; kind: string; feeRate: number | string | null; settlementDays: number | null; active: boolean };
type Entry = { id: string; description: string; amount: number | string; dueDate: string; paidAt: string | null; status: "PENDING" | "PAID"; categoryId: string; bankAccountId: string | null; paymentMethodId: string | null; notes: string | null };

type FinanceSection = "categories" | "accounts" | "methods" | "entries" | "cashflow";

function money(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FinanceManagement({ activeEstablishmentId, canManageFinance, canManageFinanceEntries, canViewFinanceCashflow }: { activeEstablishmentId: string; canManageFinance: boolean; canManageFinanceEntries: boolean; canViewFinanceCashflow: boolean }) {
  const initialSection: FinanceSection = canManageFinance ? "categories" : canManageFinanceEntries ? "entries" : "cashflow";
  const [section, setSection] = useState<FinanceSection>(initialSection);

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Financeiro</span><h2>Núcleo financeiro básico</h2></div>
      </div>
      <p className="section-note">Cadastros de apoio (categorias, contas e formas de pagamento), lançamentos manuais de contas a pagar e a receber e o fluxo de caixa consolidado. Acertos e conciliação bancária ainda não fazem parte desta tela.</p>
      <nav className="settings-tabs" aria-label="Seções do financeiro">
        {canManageFinance && <button className={section === "categories" ? "active" : ""} onClick={() => setSection("categories")}>Categorias</button>}
        {canManageFinance && <button className={section === "accounts" ? "active" : ""} onClick={() => setSection("accounts")}>Contas bancárias</button>}
        {canManageFinance && <button className={section === "methods" ? "active" : ""} onClick={() => setSection("methods")}>Formas de pagamento</button>}
        {canManageFinanceEntries && <button className={section === "entries" ? "active" : ""} onClick={() => setSection("entries")}>Lançamentos</button>}
        {canViewFinanceCashflow && <button className={section === "cashflow" ? "active" : ""} onClick={() => setSection("cashflow")}>Fluxo de caixa</button>}
      </nav>
    </section>
    {section === "categories" && canManageFinance && <CategoriesTab />}
    {section === "accounts" && canManageFinance && <BankAccountsTab activeEstablishmentId={activeEstablishmentId} />}
    {section === "methods" && canManageFinance && <PaymentMethodsTab activeEstablishmentId={activeEstablishmentId} />}
    {section === "entries" && canManageFinanceEntries && <EntriesTab activeEstablishmentId={activeEstablishmentId} />}
    {section === "cashflow" && canViewFinanceCashflow && <CashFlowTab activeEstablishmentId={activeEstablishmentId} />}
  </section>;
}

function CategoriesTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/categories", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as categorias.");
      setCategories(data.categories ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as categorias."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), kind }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a categoria.");
      setName(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a categoria."); } finally { setCreating(false); }
  };

  const toggleActive = async (category: Category) => {
    setError("");
    try {
      const response = await fetch("/api/admin/finance/categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: category.id, active: !category.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a categoria.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a categoria."); }
  };

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Categorias financeiras</span><h2>Nova categoria</h2></div></div>
      <form onSubmit={create} className="settings-form">
        <label className="field"><span>Nome</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Aluguel, Vendas de balcão" /></label>
        <label className="field"><span>Tipo</span>
          <select value={kind} onChange={event => setKind(event.target.value as "INCOME" | "EXPENSE")}>
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Receita</option>
          </select>
        </label>
        <button className="primary" type="submit" disabled={!name.trim() || creating}>{creating ? "Criando…" : "Criar categoria"}</button>
      </form>
    </section>
    {loading ? <div className="empty"><span>Carregando categorias…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && categories.length === 0 && <div className="empty small"><span>Nenhuma categoria cadastrada ainda.</span></div>}
    {!loading && categories.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {categories.map(category => <article key={category.id} className="role-card">
          <div className="role-card-head">
            <div><b>{category.name}</b><span className={`status-pill ${category.kind === "INCOME" ? "status-active" : "status-inactive"}`}>{category.kind === "INCOME" ? "Receita" : "Despesa"}</span>{!category.active && <span className="status-pill status-inactive">Inativa</span>}</div>
            <button type="button" className={`secondary ${category.active ? "warn" : ""}`} onClick={() => toggleActive(category)}>{category.active ? "Desativar" : "Ativar"}</button>
          </div>
        </article>)}
      </div>
    </section>}
  </>;
}

function BankAccountsTab({ activeEstablishmentId }: { activeEstablishmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [form, setForm] = useState({ name: "", bank: "", agency: "", accountNumber: "", initialBalance: "" });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/bank-accounts", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as contas.");
      setAccounts(data.accounts ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as contas."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.bank.trim() || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/bank-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name.trim(), bank: form.bank.trim(), agency: form.agency.trim() || undefined, accountNumber: form.accountNumber.trim() || undefined, initialBalance: form.initialBalance ? Number(form.initialBalance) : undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a conta.");
      setForm({ name: "", bank: "", agency: "", accountNumber: "", initialBalance: "" }); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a conta."); } finally { setCreating(false); }
  };

  const toggleActive = async (account: BankAccount) => {
    setError("");
    try {
      const response = await fetch("/api/admin/finance/bank-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: account.id, active: !account.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a conta.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a conta."); }
  };

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Contas bancárias</span><h2>Nova conta</h2></div></div>
      <form onSubmit={create} className="settings-form">
        <label className="field"><span>Apelido</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Conta principal" /></label>
        <label className="field"><span>Banco</span><input value={form.bank} onChange={event => setForm({ ...form, bank: event.target.value })} placeholder="Ex.: Banco do Brasil" /></label>
        <label className="field"><span>Agência</span><input value={form.agency} onChange={event => setForm({ ...form, agency: event.target.value })} /></label>
        <label className="field"><span>Conta</span><input value={form.accountNumber} onChange={event => setForm({ ...form, accountNumber: event.target.value })} /></label>
        <label className="field"><span>Saldo inicial</span><input type="number" step="0.01" value={form.initialBalance} onChange={event => setForm({ ...form, initialBalance: event.target.value })} /></label>
        <button className="primary" type="submit" disabled={!form.name.trim() || !form.bank.trim() || creating}>{creating ? "Criando…" : "Criar conta"}</button>
      </form>
    </section>
    {loading ? <div className="empty"><span>Carregando contas…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && accounts.length === 0 && <div className="empty small"><span>Nenhuma conta bancária cadastrada ainda.</span></div>}
    {!loading && accounts.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {accounts.map(account => <article key={account.id} className="role-card">
          <div className="role-card-head">
            <div><b>{account.name}</b><span className="status-pill status-inactive">{account.bank}</span>{!account.active && <span className="status-pill status-inactive">Inativa</span>}</div>
            <button type="button" className={`secondary ${account.active ? "warn" : ""}`} onClick={() => toggleActive(account)}>{account.active ? "Desativar" : "Ativar"}</button>
          </div>
          <p className="section-note">Saldo inicial: {money(account.initialBalance)}{account.agency ? ` · Agência ${account.agency}` : ""}{account.accountNumber ? ` · Conta ${account.accountNumber}` : ""}</p>
        </article>)}
      </div>
    </section>}
  </>;
}

function PaymentMethodsTab({ activeEstablishmentId }: { activeEstablishmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
  const [form, setForm] = useState({ name: "", kind: "", feeRate: "", settlementDays: "" });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/payment-methods", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as formas de pagamento.");
      setMethods(data.methods ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as formas de pagamento."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.kind.trim() || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/payment-methods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name.trim(), kind: form.kind.trim(), feeRate: form.feeRate ? Number(form.feeRate) : undefined, settlementDays: form.settlementDays ? Number(form.settlementDays) : undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a forma de pagamento.");
      setForm({ name: "", kind: "", feeRate: "", settlementDays: "" }); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a forma de pagamento."); } finally { setCreating(false); }
  };

  const toggleActive = async (method: PaymentMethodConfig) => {
    setError("");
    try {
      const response = await fetch("/api/admin/finance/payment-methods", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ methodId: method.id, active: !method.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a forma de pagamento.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a forma de pagamento."); }
  };

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Formas de pagamento</span><h2>Nova forma de pagamento</h2></div></div>
      <p className="section-note">Este cadastro é apenas para fins financeiros e relatórios (taxas, prazo de repasse). As formas de pagamento usadas no PDV continuam fixas por enquanto.</p>
      <form onSubmit={create} className="settings-form">
        <label className="field"><span>Nome</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Cartão Stone Débito" /></label>
        <label className="field"><span>Tipo</span><input value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })} placeholder="Ex.: cartao, pix, dinheiro" /></label>
        <label className="field"><span>Taxa (%)</span><input type="number" step="0.01" value={form.feeRate} onChange={event => setForm({ ...form, feeRate: event.target.value })} /></label>
        <label className="field"><span>Prazo de repasse (dias)</span><input type="number" value={form.settlementDays} onChange={event => setForm({ ...form, settlementDays: event.target.value })} /></label>
        <button className="primary" type="submit" disabled={!form.name.trim() || !form.kind.trim() || creating}>{creating ? "Criando…" : "Criar forma de pagamento"}</button>
      </form>
    </section>
    {loading ? <div className="empty"><span>Carregando formas de pagamento…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && methods.length === 0 && <div className="empty small"><span>Nenhuma forma de pagamento cadastrada ainda.</span></div>}
    {!loading && methods.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {methods.map(method => <article key={method.id} className="role-card">
          <div className="role-card-head">
            <div><b>{method.name}</b><span className="status-pill status-inactive">{method.kind}</span>{!method.active && <span className="status-pill status-inactive">Inativa</span>}</div>
            <button type="button" className={`secondary ${method.active ? "warn" : ""}`} onClick={() => toggleActive(method)}>{method.active ? "Desativar" : "Ativar"}</button>
          </div>
          <p className="section-note">{method.feeRate ? `Taxa: ${Number(method.feeRate).toFixed(2)}%` : "Sem taxa registrada"}{method.settlementDays !== null && method.settlementDays !== undefined ? ` · Repasse em ${method.settlementDays} dia(s)` : ""}</p>
        </article>)}
      </div>
    </section>}
  </>;
}

function EntriesTab({ activeEstablishmentId }: { activeEstablishmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | "PENDING" | "PAID">("PENDING");
  const [form, setForm] = useState({ categoryId: "", bankAccountId: "", paymentMethodId: "", description: "", amount: "", dueDate: "", notes: "" });
  const [creating, setCreating] = useState(false);
  const [confirmPayId, setConfirmPayId] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const response = await fetch(`/api/admin/finance/entries${params}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os lançamentos.");
      setEntries(data.entries ?? []); setCategories(data.categories ?? []); setBankAccounts(data.bankAccounts ?? []); setPaymentMethods(data.paymentMethods ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os lançamentos."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId, statusFilter]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.categoryId || !form.description.trim() || !form.amount || !form.dueDate || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: form.categoryId, bankAccountId: form.bankAccountId || undefined, paymentMethodId: form.paymentMethodId || undefined, description: form.description.trim(), amount: Number(form.amount), dueDate: form.dueDate, notes: form.notes.trim() || undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o lançamento.");
      setForm({ categoryId: "", bankAccountId: "", paymentMethodId: "", description: "", amount: "", dueDate: "", notes: "" }); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o lançamento."); } finally { setCreating(false); }
  };

  const markPaid = async (entry: Entry) => {
    setError("");
    try {
      const response = await fetch("/api/admin/finance/entries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: entry.id, status: entry.status === "PAID" ? "PENDING" : "PAID" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o lançamento.");
      setConfirmPayId(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o lançamento."); }
  };

  const categoryName = (id: string) => categories.find(item => item.id === id)?.name ?? "—";
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount), 0);

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Contas a pagar e a receber</span><h2>Novo lançamento</h2></div>
        <div className="settings-summary"><span><i />Total no filtro</span><strong>{money(total)}</strong></div>
      </div>
      {categories.length === 0 && <p className="section-note">Cadastre ao menos uma categoria financeira antes de lançar contas.</p>}
      <form onSubmit={create} className="settings-form">
        <label className="field"><span>Categoria</span>
          <select value={form.categoryId} onChange={event => setForm({ ...form, categoryId: event.target.value })}>
            <option value="">Selecione…</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name} ({category.kind === "INCOME" ? "Receita" : "Despesa"})</option>)}
          </select>
        </label>
        <label className="field"><span>Descrição</span><input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Ex.: Conta de energia" /></label>
        <label className="field"><span>Valor</span><input type="number" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label>
        <label className="field"><span>Vencimento</span><input type="date" value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} /></label>
        <label className="field"><span>Conta bancária (opcional)</span>
          <select value={form.bankAccountId} onChange={event => setForm({ ...form, bankAccountId: event.target.value })}>
            <option value="">—</option>
            {bankAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Forma de pagamento (opcional)</span>
          <select value={form.paymentMethodId} onChange={event => setForm({ ...form, paymentMethodId: event.target.value })}>
            <option value="">—</option>
            {paymentMethods.map(method => <option key={method.id} value={method.id}>{method.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Observações</span><input value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="primary" type="submit" disabled={!form.categoryId || !form.description.trim() || !form.amount || !form.dueDate || creating}>{creating ? "Lançando…" : "Lançar"}</button>
      </form>
    </section>

    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Filtro</span><h2>Lançamentos</h2></div></div>
      <nav className="settings-tabs">
        <button className={statusFilter === "PENDING" ? "active" : ""} onClick={() => setStatusFilter("PENDING")}>Pendentes</button>
        <button className={statusFilter === "PAID" ? "active" : ""} onClick={() => setStatusFilter("PAID")}>Pagos</button>
        <button className={statusFilter === "" ? "active" : ""} onClick={() => setStatusFilter("")}>Todos</button>
      </nav>
    </section>

    {loading ? <div className="empty"><span>Carregando lançamentos…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && entries.length === 0 && <div className="empty small"><span>Nenhum lançamento neste filtro.</span></div>}
    {!loading && entries.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {entries.map(entry => <article key={entry.id} className="role-card">
          <div className="role-card-head">
            <div><b>{entry.description}</b><span className={`status-pill ${entry.status === "PAID" ? "status-active" : "status-inactive"}`}>{entry.status === "PAID" ? "Pago" : "Pendente"}</span></div>
            {confirmPayId === entry.id ? <span>
              Confirmar? <button type="button" className="primary" onClick={() => markPaid(entry)}>Sim</button> <button type="button" className="secondary" onClick={() => setConfirmPayId("")}>Cancelar</button>
            </span> : <button type="button" className="secondary" onClick={() => setConfirmPayId(entry.id)}>{entry.status === "PAID" ? "Marcar como pendente" : "Marcar como pago"}</button>}
          </div>
          <p className="section-note">{categoryName(entry.categoryId)} · {money(entry.amount)} · Vencimento {new Date(entry.dueDate).toLocaleDateString("pt-BR")}{entry.paidAt ? ` · Pago em ${new Date(entry.paidAt).toLocaleDateString("pt-BR")}` : ""}</p>
        </article>)}
      </div>
    </section>}
  </>;
}

type CashFlowItemView = { id: string; date: string; description: string; type: "IN" | "OUT"; amount: number; source: "ENTRY" | "SALE" | "CASH_MOVEMENT" };
type CashFlowData = { income: number; expense: number; balance: number; openingBalance: number; accumulatedBalance: number; items: CashFlowItemView[]; from: string; to: string };

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(reference: Date) {
  const date = new Date(reference);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

function startOfMonth(reference: Date) {
  return new Date(reference.getFullYear(), reference.getMonth(), 1);
}

const sourceLabel: Record<CashFlowItemView["source"], string> = { ENTRY: "Lançamento", SALE: "Venda", CASH_MOVEMENT: "Movimentação de caixa" };

function CashFlowTab({ activeEstablishmentId }: { activeEstablishmentId: string }) {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<CashFlowData | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/finance/cashflow?from=${from}&to=${to}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o fluxo de caixa.");
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o fluxo de caixa."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId, from, to]);

  const applyShortcut = (shortcut: "today" | "week" | "month") => {
    const now = new Date();
    if (shortcut === "today") { setFrom(toDateInput(now)); setTo(toDateInput(now)); }
    if (shortcut === "week") { setFrom(toDateInput(startOfWeek(now))); setTo(toDateInput(now)); }
    if (shortcut === "month") { setFrom(toDateInput(startOfMonth(now))); setTo(toDateInput(now)); }
  };

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Fluxo de caixa</span><h2>Período</h2></div></div>
      <p className="section-note">Consolida lançamentos financeiros pagos e vendas realizadas no período (regime de caixa), somados às retiradas e suprimentos de caixa. Não substitui a conciliação bancária.</p>
      <div className="settings-form">
        <label className="field"><span>De</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="field"><span>Até</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      </div>
      <nav className="settings-tabs">
        <button type="button" onClick={() => applyShortcut("today")}>Hoje</button>
        <button type="button" onClick={() => applyShortcut("week")}>Esta semana</button>
        <button type="button" onClick={() => applyShortcut("month")}>Este mês</button>
      </nav>
    </section>

    {loading ? <div className="empty"><span>Carregando fluxo de caixa…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}

    {!loading && !error && data && <section className="panel settings-shell">
      <div className="metric-cards">
        <div className="role-card"><b>Entradas</b><p className="section-note">{money(data.income)}</p></div>
        <div className="role-card"><b>Saídas</b><p className="section-note">{money(data.expense)}</p></div>
        <div className="role-card"><b>Saldo do período</b><p className="section-note">{money(data.balance)}</p></div>
        <div className="role-card"><b>Saldo acumulado</b><p className="section-note">{money(data.accumulatedBalance)}</p></div>
      </div>
    </section>}

    {!loading && !error && data && data.items.length === 0 && <div className="empty small"><span>Nenhuma movimentação neste período.</span></div>}
    {!loading && !error && data && data.items.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {data.items.map(item => <article key={`${item.source}-${item.id}`} className="role-card">
          <div className="role-card-head">
            <div><b>{item.description}</b><span className={`status-pill ${item.type === "IN" ? "status-active" : "status-inactive"}`}>{item.type === "IN" ? "Entrada" : "Saída"}</span></div>
            <strong>{money(item.amount)}</strong>
          </div>
          <p className="section-note">{sourceLabel[item.source]} · {new Date(item.date).toLocaleString("pt-BR")}</p>
        </article>)}
      </div>
    </section>}
  </>;
}
