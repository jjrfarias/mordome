import { useEffect, useState } from "react";
import { CircleDollarSign, Printer, Scale } from "lucide-react";

type DriverDefinition = { key: string; label: string; description: string; status: "available" | "planned"; configFields: { key: string; label: string; placeholder?: string; required?: boolean }[] };
type Category = "PRINTER" | "PAYMENT" | "SCALE";
type Catalog = Record<Category, DriverDefinition[]>;

const categoryMeta: Record<Category, { title: string; kicker: string; icon: typeof Printer }> = {
  PRINTER: { title: "Impressão", kicker: "Comandas e recibos", icon: Printer },
  PAYMENT: { title: "Pagamento", kicker: "Confirmação na maquininha", icon: CircleDollarSign },
  SCALE: { title: "Balança", kicker: "Produtos vendidos por peso", icon: Scale },
};

export function IntegrationsManagement({ activeEstablishmentId, onChanged }: { activeEstablishmentId: string; onChanged: () => Promise<void> }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [active, setActive] = useState<Record<Category, string>>({ PRINTER: "manual", PAYMENT: "manual", SCALE: "manual" });
  const [config, setConfig] = useState<Record<Category, Record<string, string>>>({ PRINTER: {}, PAYMENT: {}, SCALE: {} });
  const [selection, setSelection] = useState<Record<Category, string>>({ PRINTER: "manual", PAYMENT: "manual", SCALE: "manual" });
  const [draftConfig, setDraftConfig] = useState<Record<Category, Record<string, string>>>({ PRINTER: {}, PAYMENT: {}, SCALE: {} });
  const [saving, setSaving] = useState<Category | "">("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/integrations", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as integrações.");
      setCatalog(data.catalog); setActive(data.active); setConfig(data.config);
      setSelection(data.active); setDraftConfig(data.config);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as integrações."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId]);

  const save = async (category: Category) => {
    setSaving(category); setError("");
    try {
      const response = await fetch("/api/admin/integrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, driver: selection[category], config: draftConfig[category] }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar.");
      await load(); await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); } finally { setSaving(""); }
  };

  if (loading) return <section className="page-content"><div className="empty"><span>Carregando integrações…</span></div></section>;
  if (!catalog) return <section className="page-content">{error && <div className="auth-error">{error}</div>}</section>;

  return <section className="page-content">
    {error && <div className="auth-error">{error}</div>}
    {(Object.keys(categoryMeta) as Category[]).map(category => {
      const meta = categoryMeta[category];
      const Icon = meta.icon;
      const drivers = catalog[category];
      const chosen = drivers.find(driver => driver.key === selection[category]) ?? drivers[0];
      const dirty = selection[category] !== active[category] || JSON.stringify(draftConfig[category]) !== JSON.stringify(config[category]);
      return <section className="panel settings-shell" key={category}>
        <div className="settings-shell-header">
          <div><span className="section-kicker">{meta.kicker}</span><h2><Icon className="integration-title-icon" />{meta.title}</h2></div>
          <div className="settings-summary"><span><i />Ativo</span><strong className="integration-active-label">{drivers.find(driver => driver.key === active[category])?.label ?? active[category]}</strong></div>
        </div>
        <div className="integration-driver-list">
          {drivers.map(driver => <label key={driver.key} className={`integration-driver ${selection[category] === driver.key ? "selected" : ""}`}>
            <input type="radio" name={category} checked={selection[category] === driver.key} onChange={() => setSelection(current => ({ ...current, [category]: driver.key }))} />
            <div>
              <div className="integration-driver-head"><b>{driver.label}</b>{driver.status === "planned" && <span className="status-pill status-inactive">Em breve</span>}</div>
              <p>{driver.description}</p>
            </div>
          </label>)}
        </div>
        {chosen.configFields.length > 0 && <div className="integration-config-fields">
          {chosen.configFields.map(field => <label className="field" key={field.key}>
            <span>{field.label}</span>
            <input value={draftConfig[category][field.key] ?? ""} placeholder={field.placeholder} onChange={event => setDraftConfig(current => ({ ...current, [category]: { ...current[category], [field.key]: event.target.value } }))} />
          </label>)}
        </div>}
        <button type="button" className="primary" disabled={!dirty || saving === category || chosen.status === "planned"} onClick={() => save(category)}>
          {saving === category ? "Salvando…" : chosen.status === "planned" ? "Ainda não disponível" : "Salvar"}
        </button>
      </section>;
    })}
  </section>;
}
