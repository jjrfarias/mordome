"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";

type CashFront = { id: string; name: string; active: boolean };

// Frentes de caixa (ADR 0048): terminais nomeados por unidade, independentes de quem está
// logado — quem só usa um caixa não precisa cadastrar nada aqui (abrir caixa continua igual).
export function CashFrontsManagement() {
  const [fronts, setFronts] = useState<CashFront[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/cash-fronts", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as frentes de caixa.");
      setFronts(data.cashFronts ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as frentes de caixa."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/cash-fronts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a frente de caixa.");
      setName(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a frente de caixa."); } finally { setSaving(false); }
  };

  const toggleActive = async (front: CashFront) => {
    setError("");
    try {
      const response = await fetch("/api/admin/cash-fronts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cashFrontId: front.id, active: !front.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a frente de caixa.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a frente de caixa."); }
  };

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Estrutura da operação</span><h2>Frentes de caixa</h2></div></div>
      <p className="section-note">Terminais nomeados desta unidade (ex.: &quot;Caixa 1&quot;, &quot;Caixa Delivery&quot;), para organizar quem abre qual caixa. Sem nenhuma frente cadastrada, abrir caixa continua funcionando exatamente como hoje.</p>
      <form onSubmit={create} className="settings-form">
        <label className="field"><span>Nova frente de caixa</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Caixa 1" /></label>
        <button className="primary" type="submit" disabled={!name.trim() || saving}>{saving ? "Criando…" : "Criar"}</button>
      </form>
    </section>

    {loading ? <div className="empty"><span>Carregando frentes de caixa…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && fronts.length === 0 && <div className="empty small"><Landmark /><span>Nenhuma frente de caixa cadastrada ainda.</span></div>}
    {!loading && fronts.length > 0 && <section className="panel settings-table-wrap">
      <div className="settings-table-body">
        {fronts.map(front => <article className="settings-row" key={front.id} style={{ gridTemplateColumns: "1fr auto auto" }}>
          <div className="settings-cell"><strong>{front.name}</strong></div>
          <div className="settings-cell"><span className={`status-pill ${front.active ? "status-active" : "status-inactive"}`}>{front.active ? "Ativa" : "Inativa"}</span></div>
          <div className="settings-cell"><div className="settings-actions"><button type="button" className={`secondary ${front.active ? "warn" : ""}`} onClick={() => void toggleActive(front)}>{front.active ? "Inativar" : "Ativar"}</button></div></div>
        </article>)}
      </div>
    </section>}
  </section>;
}
