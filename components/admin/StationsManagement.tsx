import { useEffect, useState } from "react";

type Product = { id: string; name: string; category: string };
type PrinterDriver = { key: string; label: string; description: string; status: "available" | "planned"; configFields: { key: string; label: string; placeholder?: string; required?: boolean }[] };
type Station = { id: string; name: string; active: boolean; printerDriver: string; printerConfig: Record<string, string>; productIds: string[] };

function groupByCategory(products: Product[]) {
  const groups = new Map<string, Product[]>();
  for (const product of products) groups.set(product.category, [...(groups.get(product.category) ?? []), product]);
  return [...groups.entries()];
}

export function StationsManagement({ activeEstablishmentId }: { activeEstablishmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [printerDrivers, setPrinterDrivers] = useState<PrinterDriver[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [edits, setEdits] = useState<Record<string, { printerDriver: string; printerConfig: Record<string, string>; productIds: string[] }>>({});
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/stations", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as filas.");
      setProducts(data.products ?? []); setPrinterDrivers(data.printerDrivers ?? []); setStations(data.stations ?? []);
      setEdits(Object.fromEntries((data.stations ?? []).map((station: Station) => [station.id, { printerDriver: station.printerDriver, printerConfig: station.printerConfig, productIds: station.productIds }])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as filas."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId]);

  const createStation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/stations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a fila.");
      setName(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a fila."); } finally { setCreating(false); }
  };

  const toggleActive = async (station: Station) => {
    setError("");
    try {
      const response = await fetch("/api/admin/stations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stationId: station.id, active: !station.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a fila.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a fila."); }
  };

  const save = async (stationId: string) => {
    const edit = edits[stationId];
    if (!edit) return;
    setSavingId(stationId); setError("");
    try {
      const response = await fetch("/api/admin/stations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stationId, printerDriver: edit.printerDriver, printerConfig: edit.printerConfig, productIds: edit.productIds }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar a fila.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a fila."); } finally { setSavingId(""); }
  };

  const toggleProduct = (stationId: string, productId: string) => {
    setEdits(current => { const edit = current[stationId]; const productIds = edit.productIds.includes(productId) ? edit.productIds.filter(id => id !== productId) : [...edit.productIds, productId]; return { ...current, [stationId]: { ...edit, productIds } }; });
  };

  const grouped = groupByCategory(products);
  const assignedElsewhere = (stationId: string, productId: string) => stations.some(station => station.id !== stationId && (edits[station.id]?.productIds ?? station.productIds).includes(productId));

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Cozinha em etapas</span><h2>Filas de preparo</h2></div>
        <div className="settings-summary"><span><i />Filas</span><strong>{stations.length}</strong></div>
      </div>
      <form onSubmit={createStation} className="settings-form">
        <label className="field"><span>Nova fila</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Lanches, Bebidas, Sobremesas" /></label>
        <button className="primary" type="submit" disabled={!name.trim() || creating}>{creating ? "Criando…" : "Criar fila"}</button>
      </form>
      <p className="section-note">Cada produto pertence a no máximo uma fila. Produtos não atribuídos aparecem em todas as telas de cozinha.</p>
    </section>

    {loading ? <div className="empty"><span>Carregando filas…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}

    {!loading && stations.length === 0 && <div className="empty small"><span>Nenhuma fila criada ainda. Sem filas, a cozinha funciona como uma tela única, do jeito que já é hoje.</span></div>}

    {!loading && stations.length > 0 && <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Filas existentes</span><h2>Configurar filas</h2></div></div>
      <div className="role-list">
        {stations.map(station => { const edit = edits[station.id] ?? { printerDriver: station.printerDriver, printerConfig: station.printerConfig, productIds: station.productIds }; const chosenDriver = printerDrivers.find(driver => driver.key === edit.printerDriver); return <article key={station.id} className="role-card">
          <div className="role-card-head">
            <div><b>{station.name}</b><span className={`status-pill ${station.active ? "status-active" : "status-inactive"}`}>{station.active ? "Ativa" : "Inativa"}</span></div>
            <button type="button" className={`secondary ${station.active ? "warn" : ""}`} onClick={() => toggleActive(station)}>{station.active ? "Desativar" : "Ativar"}</button>
          </div>

          <div className="access-picker">
            <span>Impressora desta fila</span>
            <div className="integration-driver-list">
              {printerDrivers.map(driver => <label key={driver.key} className={`integration-driver ${edit.printerDriver === driver.key ? "selected" : ""}`}>
                <input type="radio" name={`printer-${station.id}`} checked={edit.printerDriver === driver.key} disabled={driver.status === "planned"} onChange={() => setEdits(current => ({ ...current, [station.id]: { ...edit, printerDriver: driver.key } }))} />
                <div>
                  <div className="integration-driver-head"><b>{driver.label}</b>{driver.status === "planned" && <span className="status-pill status-inactive">Em breve</span>}</div>
                  <p>{driver.description}</p>
                </div>
              </label>)}
            </div>
            {chosenDriver && chosenDriver.configFields.length > 0 && <div className="integration-config-fields">
              {chosenDriver.configFields.map(field => <label className="field" key={field.key}>
                <span>{field.label}</span>
                <input value={edit.printerConfig[field.key] ?? ""} placeholder={field.placeholder} onChange={event => setEdits(current => ({ ...current, [station.id]: { ...edit, printerConfig: { ...edit.printerConfig, [field.key]: event.target.value } } }))} />
              </label>)}
            </div>}
          </div>

          <div className="access-picker">
            <span>Produtos desta fila</span>
            <div className="permission-groups">
              {grouped.map(([categoryName, items]) => <div key={categoryName} className="permission-group">
                <small>{categoryName}</small>
                {items.map(product => { const disabled = assignedElsewhere(station.id, product.id); return <label key={product.id} className={`permission-check ${disabled ? "disabled" : ""}`} title={disabled ? "Já atribuído a outra fila" : undefined}>
                  <input type="checkbox" disabled={disabled} checked={edit.productIds.includes(product.id)} onChange={() => toggleProduct(station.id, product.id)} />{product.name}
                </label>; })}
              </div>)}
            </div>
          </div>

          <button type="button" className="primary" disabled={savingId === station.id} onClick={() => save(station.id)}>{savingId === station.id ? "Salvando…" : "Salvar fila"}</button>
        </article>; })}
      </div>
    </section>}
  </section>;
}
