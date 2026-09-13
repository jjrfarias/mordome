import { useEffect, useState } from "react";

type Table = { id: string; number: number; seats: number; name: string | null; area: string | null; assignedWaiterId: string | null; active: boolean };
type Waiter = { id: string; name: string };

function groupByArea(tables: Table[]) {
  const groups = new Map<string, Table[]>();
  for (const table of tables) groups.set(table.area?.trim() || "Sem área", [...(groups.get(table.area?.trim() || "Sem área") ?? []), table]);
  return [...groups.entries()];
}

export function SalonManagement({ activeEstablishmentId }: { activeEstablishmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [edits, setEdits] = useState<Record<string, { area: string; seats: string; assignedWaiterId: string }>>({});
  const [savingId, setSavingId] = useState("");
  const [area, setArea] = useState("");
  const [seats, setSeats] = useState("4");
  const [quantity, setQuantity] = useState("1");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/tables", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o salão.");
      setTables(data.tables ?? []); setWaiters(data.waiters ?? []);
      setEdits(Object.fromEntries((data.tables ?? []).map((table: Table) => [table.id, { area: table.area ?? "", seats: String(table.seats), assignedWaiterId: table.assignedWaiterId ?? "" }])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o salão."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId]);

  const createTables = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedQuantity = Number(quantity); const parsedSeats = Number(seats);
    if (!parsedQuantity || parsedQuantity < 1 || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/tables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ area: area.trim() || undefined, seats: parsedSeats || 4, quantity: parsedQuantity }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar as mesas.");
      setArea(""); setSeats("4"); setQuantity("1"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar as mesas."); } finally { setCreating(false); }
  };

  const toggleActive = async (table: Table) => {
    setError("");
    try {
      const response = await fetch("/api/admin/tables", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tableId: table.id, active: !table.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a mesa.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a mesa."); }
  };

  const save = async (tableId: string) => {
    const edit = edits[tableId]; if (!edit) return;
    setSavingId(tableId); setError("");
    try {
      const response = await fetch("/api/admin/tables", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tableId, area: edit.area.trim() || null, seats: Number(edit.seats) || 4, assignedWaiterId: edit.assignedWaiterId || null }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar a mesa.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a mesa."); } finally { setSavingId(""); }
  };

  const grouped = groupByArea(tables);
  const active = tables.filter(table => table.active).length;

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Estrutura do salão</span><h2>Mesas e áreas</h2></div>
        <div className="settings-summary"><span><i />Mesas ativas</span><strong>{active}</strong></div>
      </div>
      <form onSubmit={createTables} className="settings-form">
        <label className="field"><span>Área</span><input value={area} onChange={event => setArea(event.target.value)} placeholder="Ex.: Interna, Área externa, Andar de cima" /></label>
        <label className="field"><span>Lugares por mesa</span><input inputMode="numeric" value={seats} onChange={event => setSeats(event.target.value)} placeholder="4" /></label>
        <label className="field"><span>Quantidade de mesas</span><input inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Ex.: 5" /></label>
        <button className="primary" type="submit" disabled={!Number(quantity) || creating}>{creating ? "Criando…" : "Criar mesas"}</button>
      </form>
      <p className="section-note">Cada mesa pode ficar restrita a um garçom específico: no salão dele, só as mesas atribuídas a ele aparecem. Mesas sem garçom definido aparecem para toda a equipe.</p>
    </section>

    {loading ? <div className="empty"><span>Carregando salão…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && tables.length === 0 && <div className="empty small"><span>Nenhuma mesa criada ainda.</span></div>}

    {!loading && tables.length > 0 && grouped.map(([areaName, areaTables]) => <section className="panel settings-shell" key={areaName}>
      <div className="settings-shell-header"><div><span className="section-kicker">{areaName}</span><h2>{areaTables.length} {areaTables.length === 1 ? "mesa" : "mesas"}</h2></div></div>
      <div className="settings-table-wrap">
        {areaTables.map(table => { const edit = edits[table.id] ?? { area: table.area ?? "", seats: String(table.seats), assignedWaiterId: table.assignedWaiterId ?? "" }; return <div className="settings-row salon-row" key={table.id}>
          <div className="settings-cell"><strong>Mesa {table.number}</strong><span className={`status-pill ${table.active ? "status-active" : "status-inactive"}`}>{table.active ? "Ativa" : "Inativa"}</span></div>
          <label className="field"><span>Área</span><input value={edit.area} onChange={event => setEdits(current => ({ ...current, [table.id]: { ...edit, area: event.target.value } }))} placeholder="Sem área" /></label>
          <label className="field"><span>Lugares</span><input inputMode="numeric" value={edit.seats} onChange={event => setEdits(current => ({ ...current, [table.id]: { ...edit, seats: event.target.value } }))} /></label>
          <label className="field"><span>Garçom responsável</span><select value={edit.assignedWaiterId} onChange={event => setEdits(current => ({ ...current, [table.id]: { ...edit, assignedWaiterId: event.target.value } }))}>
            <option value="">Toda a equipe</option>
            {waiters.map(waiter => <option key={waiter.id} value={waiter.id}>{waiter.name}</option>)}
          </select></label>
          <div className="settings-actions">
            <button type="button" className="secondary" disabled={savingId === table.id} onClick={() => save(table.id)}>{savingId === table.id ? "Salvando…" : "Salvar"}</button>
            <button type="button" className={`secondary ${table.active ? "warn" : ""}`} onClick={() => toggleActive(table)}>{table.active ? "Desativar" : "Ativar"}</button>
          </div>
        </div>; })}
      </div>
    </section>)}
  </section>;
}
