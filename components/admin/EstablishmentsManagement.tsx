import { useEffect, useState } from "react";

type EstablishmentItem = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
};

type EstablishmentsPayload = {
  establishments: EstablishmentItem[];
};

type EstablishmentFormState = {
  id: string;
  name: string;
  originalName: string;
  editing: boolean;
  saving: boolean;
};

export function EstablishmentsManagement({ activeEstablishmentId, onChanged }: { activeEstablishmentId: string; onChanged: () => Promise<void> }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EstablishmentItem[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [edits, setEdits] = useState<EstablishmentFormState[]>([]);

  const activeCount = rows.filter((row) => row.active).length;

  const load = async () => {
    setError("");
    const response = await fetch("/api/admin/establishments", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Não foi possível carregar os estabelecimentos.");
      setRows([]);
      setEdits([]);
      setLoading(false);
      return;
    }
    const parsed = data as EstablishmentsPayload;
    setRows(parsed.establishments);
    setEdits(
      parsed.establishments.map((establishment) => ({
        id: establishment.id,
        name: establishment.name,
        originalName: establishment.name,
        editing: false,
        saving: false,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const setEditMode = (id: string, editing: boolean) => {
    setEdits((current) => current.map((item) => (item.id === id ? { ...item, editing } : item)));
  };
  const setDraft = (id: string, nameValue: string) => {
    setEdits((current) => current.map((item) => (item.id === id ? { ...item, name: nameValue } : item)));
  };
  const setSavingState = (id: string, savingValue: boolean) => {
    setEdits((current) => current.map((item) => (item.id === id ? { ...item, saving: savingValue } : item)));
  };

  const editState = (id: string) => edits.find((item) => item.id === id);
  const canCreate = name.trim().length >= 2;

  const createEstablishment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || saving) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/admin/establishments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Não foi possível criar o estabelecimento.");
      } else {
        setName("");
        await load();
        await onChanged();
      }
    } catch {
      setError("Falha ao conectar no servidor.");
    } finally {
      setSaving(false);
    }
  };

  const saveName = async (id: string) => {
    const draft = editState(id);
    if (!draft || saving || !draft.name.trim() || draft.name.trim() === draft.originalName) return;

    const payload = { establishmentId: id, name: draft.name.trim() };
    setSavingState(id, true);
    setError("");
    try {
      const response = await fetch("/api/admin/establishments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Não foi possível atualizar o nome.");
      } else {
        await load();
        await onChanged();
      }
    } catch {
      setError("Falha ao conectar no servidor.");
    } finally {
      setSavingState(id, false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    setError("");
    const wasSaving = edits.some((item) => item.saving);
    if (wasSaving || saving) return;

    setSavingState(id, true);
    try {
      const response = await fetch("/api/admin/establishments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId: id, active: !active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Não foi possível alterar o status.");
        return;
      }
      await load();
      await onChanged();
    } catch {
      setError("Falha ao conectar no servidor.");
    } finally {
      setSavingState(id, false);
    }
  };

  const startEdit = (id: string, name: string) => {
    setEditMode(id, true);
    setDraft(id, name);
  };

  const cancelEdit = (id: string) => {
    const current = editState(id);
    if (!current) return;
    setDraft(id, current.originalName);
    setEditMode(id, false);
  };

  const hasResults = !loading && !error && rows.length > 0;

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div>
          <span className="section-kicker">Estrutura da operação</span>
          <h2>Estabelecimentos</h2>
        </div>
        <div className="settings-summary" aria-label={`${activeCount} de ${rows.length} unidades ativas`}>
          <span><i /> Em operação</span>
          <strong>{activeCount}<small>/{rows.length}</small></strong>
        </div>
      </div>

      <form onSubmit={createEstablishment} className="settings-form">
        <label className="field">
          <span>Novo estabelecimento</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Digite o nome" />
        </label>
        <button className="primary" type="submit" disabled={!canCreate || saving}>Incluir</button>
      </form>
    </section>

    {loading ? <div className="empty"><span>Carregando estabelecimentos...</span></div> : null}
    {error && <div className="auth-error">{error}</div>}

    {hasResults ? <section className="panel settings-table-wrap">
      <div className="settings-table-head">
        <span>Unidade</span>
        <span>Slug</span>
        <span>Status</span>
        <span>Ações</span>
      </div>
      <div className="settings-table-body">
        {rows.map((establishment) => {
          const edit = editState(establishment.id);
          const isEditing = edit?.editing ?? false;
          const editableName = edit?.name ?? "";

          return <article className="settings-row" key={establishment.id}>
            <div className="settings-cell">
              {isEditing ? <input className="inline-input" value={editableName} onChange={(event) => setDraft(establishment.id, event.target.value)} /> : <strong>{establishment.name}</strong>}
            </div>
            <div className="settings-cell settings-slug">{establishment.slug}</div>
            <div className="settings-cell">
              <span className={`status-pill ${establishment.active ? "status-active" : "status-inactive"}`}>
                {establishment.active ? "Ativo" : "Inativo"}
              </span>
            </div>
            <div className="settings-cell">
              <div className="settings-actions">
                <button type="button" className="secondary" disabled={edit?.saving || saving || (isEditing && (!editableName.trim() || editableName.trim() === establishment.name))} onClick={() => {
                  if (!isEditing) return startEdit(establishment.id, establishment.name);
                  void saveName(establishment.id);
                }}>
                  {isEditing ? "Salvar nome" : "Editar"}
                </button>
                {isEditing && <button type="button" className="secondary" onClick={() => cancelEdit(establishment.id)}>
                  Cancelar
                </button>}
                <button type="button" className={`secondary ${establishment.active ? "warn" : ""}`} title={establishment.id === activeEstablishmentId && establishment.active ? "Troque a unidade ativa antes de desativá-la" : undefined} disabled={edit?.saving || saving || (establishment.active && (activeCount <= 1 || establishment.id === activeEstablishmentId))} onClick={() => toggleActive(establishment.id, establishment.active)}>
                  {establishment.active ? "Inativar" : "Ativar"}
                </button>
              </div>
            </div>
          </article>;
        })}
      </div>
    </section> : null}

    {!loading && !error && rows.length === 0 ? <div className="empty"><span>Nenhum estabelecimento encontrado.</span></div> : null}
  </section>;
}
