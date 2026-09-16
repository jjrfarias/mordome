import { useEffect, useState } from "react";
import { CircleDollarSign, Printer, Scale } from "lucide-react";
import { buildReceiptHtml } from "@/lib/integrations/print-client";

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
    <PrintTemplateManagement activeEstablishmentId={activeEstablishmentId} />
  </section>;
}

type PrintTemplateForm = { headerText: string; footerText: string; showDocument: boolean; paperWidth: 58 | 80 };
const DEFAULT_TEMPLATE_FORM: PrintTemplateForm = { headerText: "", footerText: "", showDocument: false, paperWidth: 80 };

function PrintTemplateManagement({ activeEstablishmentId }: { activeEstablishmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PrintTemplateForm>(DEFAULT_TEMPLATE_FORM);
  const [establishmentDocument, setEstablishmentDocument] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/print-templates", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o modelo de impressão.");
      setForm({ headerText: data.template.headerText ?? "", footerText: data.template.footerText ?? "", showDocument: data.template.showDocument ?? false, paperWidth: data.template.paperWidth === 58 ? 58 : 80 });
      setEstablishmentDocument(data.establishmentDocument ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o modelo de impressão."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [activeEstablishmentId]);

  const save = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/print-templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ headerText: form.headerText.trim() || null, footerText: form.footerText.trim() || null, showDocument: form.showDocument, paperWidth: form.paperWidth }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o modelo de impressão.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o modelo de impressão."); } finally { setSaving(false); }
  };

  if (loading) return <section className="panel settings-shell"><div className="empty"><span>Carregando modelo de impressão…</span></div></section>;

  const previewHtml = buildReceiptHtml(
    { establishmentName: "Betão Hot Dog", items: [{ name: "X-Salada", quantity: 2, unitPrice: 18 }, { name: "Refrigerante lata", quantity: 1, unitPrice: 6 }], total: 42, payment: "Pix", channel: "POS" },
    { headerText: form.headerText || null, footerText: form.footerText || null, showDocument: form.showDocument, paperWidth: form.paperWidth, establishmentDocument },
  );

  return <section className="panel settings-shell">
    {error && <div className="auth-error">{error}</div>}
    <div className="settings-shell-header">
      <div><span className="section-kicker">Aparência do recibo</span><h2><Printer className="integration-title-icon" />Modelos de impressão</h2></div>
    </div>
    <div className="print-template-editor">
      <div className="print-template-fields">
        <label className="field"><span>Texto de cabeçalho (opcional)</span><input value={form.headerText} placeholder="Ex.: Rua das Flores, 123 — (21) 99999-0000" onChange={event => setForm(current => ({ ...current, headerText: event.target.value }))} /></label>
        <label className="field"><span>Texto de rodapé (opcional)</span><input value={form.footerText} placeholder="Ex.: Volte sempre! Família Betão" onChange={event => setForm(current => ({ ...current, footerText: event.target.value }))} /></label>
        <label className="field"><span>Largura do papel</span>
          <select value={form.paperWidth} onChange={event => setForm(current => ({ ...current, paperWidth: event.target.value === "58" ? 58 : 80 }))}>
            <option value={80}>80mm (padrão)</option>
            <option value={58}>58mm</option>
          </select>
        </label>
        <label className="field print-template-checkbox">
          <span>Mostrar CNPJ/documento no recibo</span>
          <input type="checkbox" checked={form.showDocument} onChange={event => setForm(current => ({ ...current, showDocument: event.target.checked }))} />
        </label>
        {form.showDocument && !establishmentDocument && <p className="print-template-hint">Nenhum documento cadastrado para esta unidade — cadastre em Estabelecimentos para que apareça no recibo.</p>}
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar"}</button>
      </div>
      <div className="print-template-preview">
        <span className="section-kicker">Prévia ao vivo</span>
        <div className="print-template-paper">
          <iframe title="Prévia do recibo" srcDoc={previewHtml} />
        </div>
      </div>
    </div>
  </section>;
}
