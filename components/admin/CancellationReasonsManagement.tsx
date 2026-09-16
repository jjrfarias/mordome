import { useEffect, useState } from "react";

// Cadastro de motivos pré-definidos de cancelamento/reembolso (ver ADR 0029).
// Escopo por organização — os motivos valem para todas as unidades da rede.
type Category = "SALE_CANCEL" | "ITEM_CANCEL" | "REFUND";
type Reason = { id: string; category: Category; label: string; active: boolean };

const categoryLabels: Record<Category, string> = {
  SALE_CANCEL: "Cancelamento de venda",
  ITEM_CANCEL: "Cancelamento de item enviado",
  REFUND: "Reembolso",
};
const categories: Category[] = ["SALE_CANCEL", "ITEM_CANCEL", "REFUND"];

export function CancellationReasonsManagement() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [filter, setFilter] = useState<Category | "ALL">("ALL");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<Category>("SALE_CANCEL");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/cancellation-reasons", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os motivos.");
      setReasons(data.reasons ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os motivos."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (label.trim().length < 2 || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/cancellation-reasons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, label: label.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o motivo.");
      setLabel(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o motivo."); } finally { setCreating(false); }
  };

  const toggleActive = async (reason: Reason) => {
    setError("");
    try {
      const response = await fetch("/api/admin/cancellation-reasons", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reasonId: reason.id, active: !reason.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o motivo.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o motivo."); }
  };

  const visible = reasons.filter(reason => filter === "ALL" || reason.category === filter);

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Motivos de cancelamento</span><h2>Novo motivo</h2></div></div>
      <p className="section-note">Cadastre motivos pré-definidos para agilizar cancelamento de venda, cancelamento de item enviado à cozinha e reembolso. Quem for cancelar sempre pode escolher &quot;Outro&quot; e digitar um motivo diferente.</p>
      <form onSubmit={create} className="settings-form">
        <label className="field"><span>Categoria</span>
          <select value={category} onChange={event => setCategory(event.target.value as Category)}>
            {categories.map(item => <option key={item} value={item}>{categoryLabels[item]}</option>)}
          </select>
        </label>
        <label className="field"><span>Motivo</span><input value={label} onChange={event => setLabel(event.target.value)} placeholder="Ex.: Pedido errado" /></label>
        <button className="primary" type="submit" disabled={label.trim().length < 2 || creating}>{creating ? "Criando…" : "Criar motivo"}</button>
      </form>
    </section>
    <section className="panel settings-shell">
      <nav className="settings-tabs" aria-label="Filtrar por categoria">
        <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>Todas</button>
        {categories.map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{categoryLabels[item]}</button>)}
      </nav>
    </section>
    {loading ? <div className="empty"><span>Carregando motivos…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && visible.length === 0 && <div className="empty small"><span>Nenhum motivo cadastrado ainda nessa categoria.</span></div>}
    {!loading && visible.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {visible.map(reason => <article key={reason.id} className="role-card">
          <div className="role-card-head">
            <div><b>{reason.label}</b><span className="status-pill status-inactive">{categoryLabels[reason.category]}</span>{!reason.active && <span className="status-pill status-inactive">Inativo</span>}</div>
            <button type="button" className={`secondary ${reason.active ? "warn" : ""}`} onClick={() => toggleActive(reason)}>{reason.active ? "Desativar" : "Ativar"}</button>
          </div>
        </article>)}
      </div>
    </section>}
  </section>;
}
