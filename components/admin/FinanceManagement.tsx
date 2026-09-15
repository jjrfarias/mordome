import { useEffect, useState } from "react";

type Category = { id: string; name: string; kind: "INCOME" | "EXPENSE"; active: boolean };
type BankAccount = { id: string; name: string; bank: string; agency: string | null; accountNumber: string | null; initialBalance: number | string; active: boolean };
type PaymentMethodConfig = { id: string; name: string; kind: string; feeRate: number | string | null; settlementDays: number | null; active: boolean };
type Supplier = { id: string; name: string; tradeName: string | null; document: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean };
type Entry = { id: string; description: string; amount: number | string; dueDate: string; paidAt: string | null; status: "PENDING" | "PAID"; categoryId: string; bankAccountId: string | null; paymentMethodId: string | null; supplierId: string | null; notes: string | null };
type ReconciliationEntry = { id: string; description: string; amount: number | string; paidAt: string | null; reconciled: boolean; reconciledAt: string | null };

type FinanceSection = "categories" | "accounts" | "methods" | "suppliers" | "entries" | "cashflow" | "settlements" | "reconciliation";
type CommissionRule = { id: string; userId: string; role: "COURIER" | "WAITER"; amountPerDelivery: number | string | null; percentOfSales: number | string | null };
type SettlementCandidate = { userId: string; userName?: string; role: "COURIER" | "WAITER"; deliveryCount: number; salesTotal: number; hasRule: boolean; amount: number };
type SettlementHistoryItem = { id: string; userId: string; role: "COURIER" | "WAITER"; from: string; to: string; amount: number | string; paidAt: string; user?: { name: string } };

function money(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FinanceManagement({ activeEstablishmentId, canManageFinance, canManageFinanceEntries, canViewFinanceCashflow, canManageSettlements }: { activeEstablishmentId: string; canManageFinance: boolean; canManageFinanceEntries: boolean; canViewFinanceCashflow: boolean; canManageSettlements: boolean }) {
  const initialSection: FinanceSection = canManageFinance ? "categories" : canManageFinanceEntries ? "entries" : canViewFinanceCashflow ? "cashflow" : "settlements";
  const [section, setSection] = useState<FinanceSection>(initialSection);

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Financeiro</span><h2>Núcleo financeiro básico</h2></div>
      </div>
      <p className="section-note">Cadastros de apoio (categorias, contas e formas de pagamento), lançamentos manuais de contas a pagar e a receber, fluxo de caixa consolidado, acertos de entregadores/garçons e conciliação bancária manual.</p>
      <nav className="settings-tabs" aria-label="Seções do financeiro">
        {canManageFinance && <button className={section === "categories" ? "active" : ""} onClick={() => setSection("categories")}>Categorias</button>}
        {canManageFinance && <button className={section === "accounts" ? "active" : ""} onClick={() => setSection("accounts")}>Contas bancárias</button>}
        {canManageFinance && <button className={section === "methods" ? "active" : ""} onClick={() => setSection("methods")}>Formas de pagamento</button>}
        {canManageFinance && <button className={section === "suppliers" ? "active" : ""} onClick={() => setSection("suppliers")}>Fornecedores</button>}
        {canManageFinanceEntries && <button className={section === "entries" ? "active" : ""} onClick={() => setSection("entries")}>Lançamentos</button>}
        {canViewFinanceCashflow && <button className={section === "cashflow" ? "active" : ""} onClick={() => setSection("cashflow")}>Fluxo de caixa</button>}
        {canManageSettlements && <button className={section === "settlements" ? "active" : ""} onClick={() => setSection("settlements")}>Acertos</button>}
        {canManageFinanceEntries && <button className={section === "reconciliation" ? "active" : ""} onClick={() => setSection("reconciliation")}>Conciliação bancária</button>}
      </nav>
    </section>
    {section === "categories" && canManageFinance && <CategoriesTab />}
    {section === "accounts" && canManageFinance && <BankAccountsTab activeEstablishmentId={activeEstablishmentId} />}
    {section === "methods" && canManageFinance && <PaymentMethodsTab activeEstablishmentId={activeEstablishmentId} />}
    {section === "suppliers" && canManageFinance && <SuppliersTab />}
    {section === "entries" && canManageFinanceEntries && <EntriesTab activeEstablishmentId={activeEstablishmentId} />}
    {section === "cashflow" && canViewFinanceCashflow && <CashFlowTab activeEstablishmentId={activeEstablishmentId} />}
    {section === "settlements" && canManageSettlements && <SettlementsTab activeEstablishmentId={activeEstablishmentId} />}
    {section === "reconciliation" && canManageFinanceEntries && <ReconciliationTab activeEstablishmentId={activeEstablishmentId} />}
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

function SuppliersTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState({ name: "", tradeName: "", document: "", phone: "", email: "", notes: "" });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/suppliers", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os fornecedores.");
      setSuppliers(data.suppliers ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os fornecedores."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name.trim(), tradeName: form.tradeName.trim() || undefined, document: form.document.trim() || undefined, phone: form.phone.trim() || undefined, email: form.email.trim() || undefined, notes: form.notes.trim() || undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o fornecedor.");
      setForm({ name: "", tradeName: "", document: "", phone: "", email: "", notes: "" }); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o fornecedor."); } finally { setCreating(false); }
  };

  const toggleActive = async (supplier: Supplier) => {
    setError("");
    try {
      const response = await fetch("/api/admin/finance/suppliers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierId: supplier.id, active: !supplier.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o fornecedor.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o fornecedor."); }
  };

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Fornecedores</span><h2>Novo fornecedor</h2></div></div>
      <p className="section-note">Cadastro básico para vincular a lançamentos financeiros (&quot;quem eu paguei&quot;). Documento (CPF/CNPJ) é opcional; quando informado, pode ser digitado com ou sem máscara.</p>
      <form onSubmit={create} className="settings-form">
        <label className="field"><span>Nome/razão social</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Distribuidora Boa Compra Ltda" /></label>
        <label className="field"><span>Nome fantasia (opcional)</span><input value={form.tradeName} onChange={event => setForm({ ...form, tradeName: event.target.value })} /></label>
        <label className="field"><span>CNPJ/CPF (opcional)</span><input value={form.document} onChange={event => setForm({ ...form, document: event.target.value })} placeholder="Com ou sem máscara" /></label>
        <label className="field"><span>Telefone/WhatsApp (opcional)</span><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label>
        <label className="field"><span>E-mail (opcional)</span><input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
        <label className="field"><span>Observações (opcional)</span><input value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
        <button className="primary" type="submit" disabled={!form.name.trim() || creating}>{creating ? "Criando…" : "Criar fornecedor"}</button>
      </form>
    </section>
    {loading ? <div className="empty"><span>Carregando fornecedores…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && suppliers.length === 0 && <div className="empty small"><span>Nenhum fornecedor cadastrado ainda.</span></div>}
    {!loading && suppliers.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {suppliers.map(supplier => <article key={supplier.id} className="role-card">
          <div className="role-card-head">
            <div><b>{supplier.name}</b>{supplier.tradeName && <span className="status-pill status-inactive">{supplier.tradeName}</span>}{!supplier.active && <span className="status-pill status-inactive">Inativo</span>}</div>
            <button type="button" className={`secondary ${supplier.active ? "warn" : ""}`} onClick={() => toggleActive(supplier)}>{supplier.active ? "Desativar" : "Ativar"}</button>
          </div>
          <p className="section-note">{[supplier.document, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "Sem dados de contato"}</p>
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | "PENDING" | "PAID">("PENDING");
  const [form, setForm] = useState({ categoryId: "", bankAccountId: "", paymentMethodId: "", supplierId: "", description: "", amount: "", dueDate: "", notes: "" });
  const [creating, setCreating] = useState(false);
  const [confirmPayId, setConfirmPayId] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const response = await fetch(`/api/admin/finance/entries${params}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os lançamentos.");
      setEntries(data.entries ?? []); setCategories(data.categories ?? []); setBankAccounts(data.bankAccounts ?? []); setPaymentMethods(data.paymentMethods ?? []); setSuppliers(data.suppliers ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os lançamentos."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId, statusFilter]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.categoryId || !form.description.trim() || !form.amount || !form.dueDate || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: form.categoryId, bankAccountId: form.bankAccountId || undefined, paymentMethodId: form.paymentMethodId || undefined, supplierId: form.supplierId || undefined, description: form.description.trim(), amount: Number(form.amount), dueDate: form.dueDate, notes: form.notes.trim() || undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o lançamento.");
      setForm({ categoryId: "", bankAccountId: "", paymentMethodId: "", supplierId: "", description: "", amount: "", dueDate: "", notes: "" }); await load();
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
  const supplierName = (id: string | null) => (id ? suppliers.find(item => item.id === id)?.name : undefined);
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
        <label className="field"><span>Fornecedor (opcional)</span>
          <select value={form.supplierId} onChange={event => setForm({ ...form, supplierId: event.target.value })}>
            <option value="">—</option>
            {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
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
          <p className="section-note">{categoryName(entry.categoryId)} · {money(entry.amount)} · Vencimento {new Date(entry.dueDate).toLocaleDateString("pt-BR")}{entry.paidAt ? ` · Pago em ${new Date(entry.paidAt).toLocaleDateString("pt-BR")}` : ""}{supplierName(entry.supplierId) ? ` · Fornecedor: ${supplierName(entry.supplierId)}` : ""}</p>
        </article>)}
      </div>
    </section>}
  </>;
}

const roleLabel: Record<"COURIER" | "WAITER", string> = { COURIER: "Entregador", WAITER: "Garçom" };

function SettlementsTab({ activeEstablishmentId }: { activeEstablishmentId: string }) {
  const [roleFilter, setRoleFilter] = useState<"COURIER" | "WAITER">("COURIER");
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<SettlementCandidate[]>([]);
  const [history, setHistory] = useState<SettlementHistoryItem[]>([]);
  const [confirmUserId, setConfirmUserId] = useState("");
  const [paying, setPaying] = useState(false);

  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [ruleForm, setRuleForm] = useState({ userId: "", role: "COURIER" as "COURIER" | "WAITER", kind: "amountPerDelivery" as "amountPerDelivery" | "percentOfSales", value: "" });
  const [ruleError, setRuleError] = useState("");
  const [savingRule, setSavingRule] = useState(false);

  const loadRules = async () => {
    try {
      const response = await fetch("/api/admin/finance/commission-rules", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as regras de comissão.");
      setRules(data.rules ?? []); setUsers(data.users ?? []);
    } catch (cause) { setRuleError(cause instanceof Error ? cause.message : "Não foi possível carregar as regras de comissão."); }
  };

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/finance/settlements?role=${roleFilter}&from=${from}&to=${to}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os acertos.");
      setCandidates(data.candidates ?? []); setHistory(data.history ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os acertos."); } finally { setLoading(false); }
  };

  useEffect(() => { queueMicrotask(() => { void loadRules(); }); }, [activeEstablishmentId]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId, roleFilter, from, to]);

  const applyShortcut = (shortcut: "today" | "week" | "month") => {
    const now = new Date();
    if (shortcut === "today") { setFrom(toDateInput(now)); setTo(toDateInput(now)); }
    if (shortcut === "week") { setFrom(toDateInput(startOfWeek(now))); setTo(toDateInput(now)); }
    if (shortcut === "month") { setFrom(toDateInput(startOfMonth(now))); setTo(toDateInput(now)); }
  };

  const createRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ruleForm.userId || !ruleForm.value || savingRule) return;
    setSavingRule(true); setRuleError("");
    try {
      const body = ruleForm.kind === "amountPerDelivery" ? { userId: ruleForm.userId, role: ruleForm.role, amountPerDelivery: Number(ruleForm.value) } : { userId: ruleForm.userId, role: ruleForm.role, percentOfSales: Number(ruleForm.value) };
      const response = await fetch("/api/admin/finance/commission-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a regra de comissão.");
      setRuleForm({ userId: "", role: "COURIER", kind: "amountPerDelivery", value: "" });
      await loadRules(); await load();
    } catch (cause) { setRuleError(cause instanceof Error ? cause.message : "Não foi possível criar a regra de comissão."); } finally { setSavingRule(false); }
  };

  const markPaid = async (candidate: SettlementCandidate) => {
    setPaying(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/settlements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: candidate.userId, role: candidate.role, from, to }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível registrar o acerto.");
      setConfirmUserId(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar o acerto."); } finally { setPaying(false); }
  };

  const userName = (userId: string) => users.find(user => user.id === userId)?.name ?? userId;

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Comissões</span><h2>Configurar comissão</h2></div></div>
      <p className="section-note">Fixo por entrega (entregadores) ou percentual sobre vendas de salão (garçons). Escolha apenas um dos dois. Sem regra configurada, o usuário aparece no acerto com valor zero.</p>
      <form onSubmit={createRule} className="settings-form">
        <label className="field"><span>Usuário</span>
          <select value={ruleForm.userId} onChange={event => setRuleForm({ ...ruleForm, userId: event.target.value })}>
            <option value="">Selecione…</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Papel</span>
          <select value={ruleForm.role} onChange={event => setRuleForm({ ...ruleForm, role: event.target.value as "COURIER" | "WAITER" })}>
            <option value="COURIER">Entregador</option>
            <option value="WAITER">Garçom</option>
          </select>
        </label>
        <label className="field"><span>Tipo de regra</span>
          <select value={ruleForm.kind} onChange={event => setRuleForm({ ...ruleForm, kind: event.target.value as "amountPerDelivery" | "percentOfSales" })}>
            <option value="amountPerDelivery">Fixo por entrega</option>
            <option value="percentOfSales">Percentual sobre vendas</option>
          </select>
        </label>
        <label className="field"><span>{ruleForm.kind === "amountPerDelivery" ? "Valor por entrega (R$)" : "Percentual (%)"}</span><input type="number" step="0.01" value={ruleForm.value} onChange={event => setRuleForm({ ...ruleForm, value: event.target.value })} /></label>
        <button className="primary" type="submit" disabled={!ruleForm.userId || !ruleForm.value || savingRule}>{savingRule ? "Salvando…" : "Salvar regra"}</button>
      </form>
    </section>
    {ruleError && <div className="auth-error">{ruleError}</div>}
    {rules.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {rules.map(rule => <article key={rule.id} className="role-card">
          <div className="role-card-head"><div><b>{userName(rule.userId)}</b><span className="status-pill status-inactive">{roleLabel[rule.role]}</span></div></div>
          <p className="section-note">{rule.amountPerDelivery ? `${money(rule.amountPerDelivery)} por entrega` : rule.percentOfSales ? `${Number(rule.percentOfSales).toFixed(2)}% sobre vendas` : "Sem valor definido"}</p>
        </article>)}
      </div>
    </section>}

    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Acertos</span><h2>Período</h2></div></div>
      <nav className="settings-tabs">
        <button className={roleFilter === "COURIER" ? "active" : ""} onClick={() => setRoleFilter("COURIER")}>Entregadores</button>
        <button className={roleFilter === "WAITER" ? "active" : ""} onClick={() => setRoleFilter("WAITER")}>Garçons</button>
      </nav>
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

    {loading ? <div className="empty"><span>Carregando acertos…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && !error && candidates.length === 0 && <div className="empty small"><span>Nenhum {roleFilter === "COURIER" ? "entregador" : "garçom"} com movimento neste período.</span></div>}
    {!loading && !error && candidates.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {candidates.map(candidate => <article key={candidate.userId} className="role-card">
          <div className="role-card-head">
            <div><b>{candidate.userName ?? userName(candidate.userId)}</b>{!candidate.hasRule && <span className="status-pill status-inactive">Sem regra de comissão configurada</span>}</div>
            <strong>{money(candidate.amount)}</strong>
          </div>
          <p className="section-note">{candidate.role === "COURIER" ? `${candidate.deliveryCount} entrega(s) concluída(s)` : `${money(candidate.salesTotal)} em vendas de salão`}</p>
          {confirmUserId === candidate.userId ? <span>
            Confirmar pagamento de {money(candidate.amount)}? <button type="button" className="primary" disabled={paying} onClick={() => markPaid(candidate)}>Sim</button> <button type="button" className="secondary" onClick={() => setConfirmUserId("")}>Cancelar</button>
          </span> : <button type="button" className="secondary" onClick={() => setConfirmUserId(candidate.userId)}>Marcar como acertado</button>}
        </article>)}
      </div>
    </section>}

    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Histórico</span><h2>Acertos pagos</h2></div></div>
    </section>
    {!loading && history.length === 0 && <div className="empty small"><span>Nenhum acerto registrado ainda.</span></div>}
    {!loading && history.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {history.map(item => <article key={item.id} className="role-card">
          <div className="role-card-head"><div><b>{item.user?.name ?? userName(item.userId)}</b><span className="status-pill status-active">{roleLabel[item.role]}</span></div><strong>{money(item.amount)}</strong></div>
          <p className="section-note">Período {new Date(item.from).toLocaleDateString("pt-BR")} a {new Date(item.to).toLocaleDateString("pt-BR")} · Pago em {new Date(item.paidAt).toLocaleString("pt-BR")}</p>
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

function ReconciliationTab({ activeEstablishmentId }: { activeEstablishmentId: string }) {
  const today = new Date();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [from, setFrom] = useState(toDateInput(startOfMonth(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<ReconciliationEntry[]>([]);
  const [totals, setTotals] = useState({ launched: 0, reconciled: 0, pending: 0 });
  const [savingId, setSavingId] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  const loadAccounts = async () => {
    try {
      const response = await fetch("/api/admin/finance/bank-accounts", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as contas bancárias.");
      const accounts: BankAccount[] = data.accounts ?? [];
      setBankAccounts(accounts);
      setBankAccountId(current => current || accounts.find(account => account.active)?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as contas bancárias."); }
  };

  const load = async () => {
    if (!bankAccountId) { setEntries([]); setTotals({ launched: 0, reconciled: 0, pending: 0 }); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/finance/reconciliation?bankAccountId=${bankAccountId}&from=${from}&to=${to}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar a conciliação.");
      setEntries(data.entries ?? []);
      setTotals({ launched: data.launched ?? 0, reconciled: data.reconciled ?? 0, pending: data.pending ?? 0 });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a conciliação."); } finally { setLoading(false); }
  };

  useEffect(() => { queueMicrotask(() => { void loadAccounts(); }); }, [activeEstablishmentId]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId, bankAccountId, from, to]);

  const applyShortcut = (shortcut: "today" | "week" | "month") => {
    const now = new Date();
    if (shortcut === "today") { setFrom(toDateInput(now)); setTo(toDateInput(now)); }
    if (shortcut === "week") { setFrom(toDateInput(startOfWeek(now))); setTo(toDateInput(now)); }
    if (shortcut === "month") { setFrom(toDateInput(startOfMonth(now))); setTo(toDateInput(now)); }
  };

  const toggleReconciled = async (entry: ReconciliationEntry) => {
    setSavingId(entry.id); setError("");
    try {
      const response = await fetch("/api/admin/finance/reconciliation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: entry.id, reconciled: !entry.reconciled }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a conciliação.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a conciliação."); } finally { setSavingId(""); }
  };

  const markAllFiltered = async () => {
    const pendingIds = entries.filter(entry => !entry.reconciled).map(entry => entry.id);
    if (pendingIds.length === 0 || markingAll) return;
    setMarkingAll(true); setError("");
    try {
      const response = await fetch("/api/admin/finance/reconciliation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryIds: pendingIds, reconciled: true }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível marcar os lançamentos como conciliados.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível marcar os lançamentos como conciliados."); } finally { setMarkingAll(false); }
  };

  const pendingCount = entries.filter(entry => !entry.reconciled).length;

  return <>
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Conciliação bancária</span><h2>Conta e período</h2></div></div>
      <p className="section-note">Confira quais lançamentos financeiros já pagos e vinculados a esta conta bancária já apareceram no extrato do banco, marcando cada um como conciliado. Vendas e movimentações de caixa não entram aqui — apenas lançamentos com uma conta bancária associada (veja a aba Lançamentos).</p>
      {bankAccounts.length === 0 && <p className="section-note">Cadastre ao menos uma conta bancária antes de conciliar.</p>}
      <div className="settings-form">
        <label className="field"><span>Conta bancária</span>
          <select value={bankAccountId} onChange={event => setBankAccountId(event.target.value)}>
            <option value="">Selecione…</option>
            {bankAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <label className="field"><span>De</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="field"><span>Até</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      </div>
      <nav className="settings-tabs">
        <button type="button" onClick={() => applyShortcut("today")}>Hoje</button>
        <button type="button" onClick={() => applyShortcut("week")}>Esta semana</button>
        <button type="button" onClick={() => applyShortcut("month")}>Este mês</button>
      </nav>
    </section>

    {!bankAccountId && <div className="empty small"><span>Selecione uma conta bancária para ver a conciliação.</span></div>}
    {bankAccountId && loading ? <div className="empty"><span>Carregando conciliação…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}

    {bankAccountId && !loading && !error && <section className="panel settings-shell">
      <div className="metric-cards">
        <div className="role-card"><b>Lançado no período</b><p className="section-note">{money(totals.launched)}</p></div>
        <div className="role-card"><b>Conciliado</b><p className="section-note">{money(totals.reconciled)}</p></div>
        <div className="role-card"><b>Pendente de conciliação</b><p className="section-note">{money(totals.pending)}</p></div>
      </div>
    </section>}

    {bankAccountId && !loading && !error && entries.length > 0 && <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Lançamentos</span><h2>{entries.length} no período</h2></div>
        <button type="button" className="secondary" disabled={pendingCount === 0 || markingAll} onClick={markAllFiltered}>{markingAll ? "Marcando…" : `Marcar todos os filtrados como conciliados (${pendingCount})`}</button>
      </div>
    </section>}

    {bankAccountId && !loading && !error && entries.length === 0 && <div className="empty small"><span>Nenhum lançamento pago desta conta no período.</span></div>}
    {bankAccountId && !loading && !error && entries.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {entries.map(entry => <article key={entry.id} className="role-card">
          <div className="role-card-head">
            <div><b>{entry.description}</b><span className={`status-pill ${entry.reconciled ? "status-active" : "status-inactive"}`}>{entry.reconciled ? "Conciliado" : "Pendente"}</span></div>
            <strong>{money(entry.amount)}</strong>
          </div>
          <p className="section-note">Pago em {entry.paidAt ? new Date(entry.paidAt).toLocaleDateString("pt-BR") : "—"}{entry.reconciledAt ? ` · Conciliado em ${new Date(entry.reconciledAt).toLocaleString("pt-BR")}` : ""}</p>
          <button type="button" className="secondary" disabled={savingId === entry.id} onClick={() => toggleReconciled(entry)}>{savingId === entry.id ? "Salvando…" : entry.reconciled ? "Desmarcar conciliação" : "Marcar como conciliado"}</button>
        </article>)}
      </div>
    </section>}
  </>;
}

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
