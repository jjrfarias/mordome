"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, MessageSquare, PackageCheck, Send, UserPlus } from "lucide-react";

type EventName = "ORDER_RECEIVED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "INVITE_ACCOUNT";
type Automation = Record<EventName, { enabled: boolean; text: string }>;
const labels: Record<EventName, { title: string; note: string; icon: typeof MessageSquare }> = {
  ORDER_RECEIVED: { title: "Pedido recebido", note: "Enviada assim que o pedido online entra na fila.", icon: MessageSquare },
  PREPARING: { title: "Em preparo", note: "Enviada quando a cozinha inicia o preparo.", icon: PackageCheck },
  OUT_FOR_DELIVERY: { title: "Saiu para entrega", note: "Enviada após a saída do entregador.", icon: Send },
  DELIVERED: { title: "Pedido concluído", note: "Enviada ao concluir a entrega e o pagamento.", icon: CheckCircle2 },
  INVITE_ACCOUNT: { title: "Convite para criar conta", note: "Somente para visitante que deu aceite explícito.", icon: UserPlus },
};
const events = Object.keys(labels) as EventName[];
const snippets = [
  { label: "😊", value: " 😊", title: "Emoji" }, { label: "✅", value: " ✅", title: "Confirmação" }, { label: "🛵", value: " 🛵", title: "Entrega" },
  { label: "• Lista", value: "\n• ", title: "Item de lista" }, { label: "1. Lista", value: "\n1. ", title: "Lista numerada" }, { label: "*Negrito*", value: "*texto*", title: "Negrito no WhatsApp" },
  { label: "Itens", value: "\n\n📋 *Itens do pedido:*\n{{itens}}", title: "Lista de produtos do pedido" },
];

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
  function insert(event: EventName, value: string) {
    setAutomation(current => current && ({ ...current, [event]: { ...current[event], text: `${current[event].text}${value}`.slice(0, 500) } }));
  }
  return <section className="panel settings-shell whatsapp-automations">
    <div className="settings-shell-header"><div><span className="section-kicker">WhatsApp para delivery</span><h2>Automações de mensagens</h2><p>Escolha quais atualizações o cliente recebe e personalize cada texto.</p></div></div>
    <div className="automation-variables"><b>Variáveis:</b> <code>{"{{nome}}"}</code>, <code>{"{{pedido}}"}</code>, <code>{"{{estabelecimento}}"}</code> e <code>{"{{itens}}"}</code> (lista do pedido).</div>
    {!automation ? <p>Carregando…</p> : <div className="automation-list">
      {events.map(event => { const Icon = labels[event].icon; return <section key={event} className={`automation-card ${automation[event].enabled ? "enabled" : ""}`}>
        <div className="automation-card-head"><span className="automation-icon"><Icon /></span><div><h3>{labels[event].title}</h3><p>{labels[event].note}</p></div><label className="automation-switch"><input type="checkbox" checked={automation[event].enabled} onChange={value => setAutomation(current => current && ({ ...current, [event]: { ...current[event], enabled: value.target.checked } }))} /><span aria-hidden /></label></div>
        <label className="automation-text"><span>Mensagem</span><textarea value={automation[event].text} maxLength={500} rows={event === "ORDER_RECEIVED" ? 5 : 3} onChange={value => setAutomation(current => current && ({ ...current, [event]: { ...current[event], text: value.target.value } }))} /><small>{automation[event].text.length}/500 caracteres</small></label>
        <div className="automation-tools" aria-label={`Recursos para ${labels[event].title}`}><span>Inserir</span>{snippets.map(snippet => <button key={snippet.title} type="button" title={snippet.title} onClick={() => insert(event, snippet.value)}>{snippet.label}</button>)}</div>
      </section>; })}
      <div className="automation-actions"><button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar automações"}</button></div>
    </div>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>;
}
