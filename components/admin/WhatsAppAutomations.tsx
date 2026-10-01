"use client";

import { useCallback, useEffect, useState } from "react";

type EventName = "ORDER_RECEIVED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "INVITE_ACCOUNT";
type Automation = Record<EventName, { enabled: boolean; text: string }>;
const labels: Record<EventName, { title: string; note: string }> = {
  ORDER_RECEIVED: { title: "Pedido recebido", note: "Enviada quando o pedido online entra na fila." },
  PREPARING: { title: "Em preparo", note: "Enviada quando a cozinha inicia o preparo." },
  OUT_FOR_DELIVERY: { title: "Saiu para entrega", note: "Enviada após a saída do entregador." },
  DELIVERED: { title: "Pedido concluído", note: "Enviada ao concluir a entrega e o pagamento." },
  INVITE_ACCOUNT: { title: "Convite para criar conta", note: "Somente em pedido online sem conta e com aceite explícito do cliente." },
};
const events = Object.keys(labels) as EventName[];

export function WhatsAppAutomations({ establishmentId }: { establishmentId: string }) {
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/whatsapp/automation", { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      setAutomation(data.automation); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as automações."); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [establishmentId, load]);
  async function save() {
    if (!automation) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/whatsapp/automation", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ automation }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      setAutomation(data.automation);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar as automações."); }
    finally { setSaving(false); }
  }
  return <section className="panel settings-shell">
    <h2>Automações do delivery</h2>
    <p>Variáveis disponíveis: <code>{"{{nome}}"}</code>, <code>{"{{pedido}}"}</code> e <code>{"{{estabelecimento}}"}</code>.</p>
    {!automation ? <p>Carregando…</p> : <div className="integration-config-fields">
      {events.map(event => <fieldset key={event} className="field">
        <label><input type="checkbox" checked={automation[event].enabled} onChange={value => setAutomation(current => current && ({ ...current, [event]: { ...current[event], enabled: value.target.checked } }))} /> <b>{labels[event].title}</b></label>
        <small>{labels[event].note}</small>
        <textarea value={automation[event].text} maxLength={500} rows={3} onChange={value => setAutomation(current => current && ({ ...current, [event]: { ...current[event], text: value.target.value } }))} />
      </fieldset>)}
      <button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar automações"}</button>
    </div>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>;
}
