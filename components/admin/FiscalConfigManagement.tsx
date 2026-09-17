"use client";

import { useEffect, useState } from "react";
import { Printer, ShieldCheck } from "lucide-react";

type FiscalConfig = { active: boolean; environment: "HOMOLOGACAO" | "PRODUCAO"; stateRegistration: string | null; taxRegime: "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL" | null; hasProviderApiToken: boolean; printDanfe: boolean };

const regimeLabels: Record<NonNullable<FiscalConfig["taxRegime"]>, string> = { SIMPLES_NACIONAL: "Simples Nacional", LUCRO_PRESUMIDO: "Lucro Presumido", LUCRO_REAL: "Lucro Real" };

// Configuração fiscal (ADR 0049): o certificado digital e o CSC NÃO são configurados aqui — ficam
// no painel do próprio provedor (Focus NFe), que a unidade acessa com sua própria conta. Esta tela
// só guarda o token de API dessa conta e os dados que o construtor de payload da NFC-e precisa.
export function FiscalConfigManagement() {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [token, setToken] = useState("");
  const [stateRegistration, setStateRegistration] = useState("");
  const [taxRegime, setTaxRegime] = useState<FiscalConfig["taxRegime"]>(null);
  const [environment, setEnvironment] = useState<FiscalConfig["environment"]>("HOMOLOGACAO");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/fiscal-config", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar a configuração fiscal.");
      const loaded: FiscalConfig = data.config;
      setConfig(loaded); setStateRegistration(loaded.stateRegistration ?? ""); setTaxRegime(loaded.taxRegime); setEnvironment(loaded.environment);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a configuração fiscal."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  const save = async (changes: Record<string, unknown>) => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/fiscal-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar.");
      setSuccess("Configuração salva."); setToken(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); } finally { setSaving(false); }
  };

  if (loading) return <section className="page-content"><div className="empty"><span>Carregando configuração fiscal…</span></div></section>;

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Fiscal</span><h2>Dados fiscais</h2></div></div>
      <p className="section-note">Emissão de NFC-e via Focus NFe. O certificado digital A1 e o CSC (Código de Segurança do Contribuinte) são configurados diretamente na conta da unidade no painel do Focus NFe — nunca aqui. Aqui só entram o token dessa conta e os dados que a nota precisa.</p>
      {error && <div className="auth-error">{error}</div>}
      {success && <p className="section-note" style={{ color: "#397257" }}>{success}</p>}

      <div className="settings-form">
        <label className="field"><span>Inscrição Estadual</span><input value={stateRegistration} onChange={event => setStateRegistration(event.target.value)} placeholder="Somente números" /></label>
        <label className="field"><span>Regime tributário</span>
          <select value={taxRegime ?? ""} onChange={event => setTaxRegime((event.target.value || null) as FiscalConfig["taxRegime"])}>
            <option value="">Selecione</option>
            {Object.entries(regimeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="settings-form">
        <label className="field"><span>Ambiente</span>
          <select value={environment} onChange={event => setEnvironment(event.target.value as FiscalConfig["environment"])}>
            <option value="HOMOLOGACAO">Homologação (testes, não vale como nota real)</option>
            <option value="PRODUCAO">Produção</option>
          </select>
        </label>
        <label className="field"><span>Token da API (Focus NFe)</span><input type="password" value={token} onChange={event => setToken(event.target.value)} placeholder={config?.hasProviderApiToken ? "Já configurado — digite para trocar" : "Cole o token da sua conta Focus NFe"} /></label>
      </div>
      <button className="primary" disabled={saving} onClick={() => void save({ stateRegistration, taxRegime, environment, ...(token ? { providerApiToken: token } : {}) })}>{saving ? "Salvando…" : "Salvar dados fiscais"}</button>

      <div className="check-line" style={{ marginTop: 18 }}>
        <input type="checkbox" checked={config?.active ?? false} disabled={saving || !config?.hasProviderApiToken} onChange={event => void save({ active: event.target.checked })} />
        <ShieldCheck size={16} />
        {config?.hasProviderApiToken ? "Emitir NFC-e automaticamente ao concluir uma venda" : "Configure o token da API antes de ativar a emissão"}
      </div>
      <div className="check-line" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={config?.printDanfe ?? false} disabled={saving || !config?.active} onChange={event => void save({ printDanfe: event.target.checked })} />
        <Printer size={16} />
        Imprimir o DANFE-NFC-e (com QR code) no lugar do recibo comum quando a nota sair autorizada
      </div>
      {config?.active && !config.printDanfe && <p className="section-note">Com essa opção desligada, o recibo impresso continua sendo o comprovante interno de sempre — a nota fica só na tela de Notas fiscais. Para cumprir a exigência legal de entregar o DANFE ao cliente, ative esta opção.</p>}
    </section>
  </section>;
}
