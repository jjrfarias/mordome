"use client";

import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { money } from "@/lib/domain";

type FiscalDocumentStatus = "PENDING" | "AUTHORIZED" | "REJECTED" | "CANCELLED" | "ERROR";
type FiscalDocument = { id: string; saleId: string; status: FiscalDocumentStatus; environment: "HOMOLOGACAO" | "PRODUCAO"; accessKey: string | null; number: string | null; series: string | null; statusMessage: string | null; danfeUrl: string | null; qrCodeUrl: string | null; createdAt: string; saleChannel?: string; saleTotal?: number };

const STATUS_LABELS: Record<FiscalDocumentStatus, string> = { PENDING: "Pendente", AUTHORIZED: "Autorizada", REJECTED: "Rejeitada", CANCELLED: "Cancelada", ERROR: "Erro" };
const CHANNEL_LABELS: Record<string, string> = { POS: "PDV", FLOOR: "Salão", DELIVERY: "Delivery", ONLINE: "Online" };

// Notas fiscais emitidas (ADR 0049): consulta e ações sobre o que já foi emitido automaticamente
// ao concluir cada venda — nunca dispara a primeira emissão a partir daqui.
export function FiscalDocumentsManagement() {
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelTarget, setCancelTarget] = useState<FiscalDocument | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/fiscal-documents", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as notas fiscais.");
      setDocuments(data.documents ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as notas fiscais."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  const retry = async (saleId: string) => {
    setRetrying(saleId); setError("");
    try {
      const response = await fetch("/api/admin/fiscal-documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "RETRY", saleId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível reemitir.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível reemitir."); } finally { setRetrying(null); }
  };

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Fiscal</span><h2>Notas fiscais</h2></div></div>
      <p className="section-note">Toda venda concluída com o módulo fiscal ativo gera uma tentativa de NFC-e automaticamente. Erros e rejeições podem ser reemitidos aqui depois de corrigir o motivo.</p>
    </section>
    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando notas fiscais…</span></div> : documents.length === 0 ? <div className="big-empty"><FileText /><h2>Nenhuma nota fiscal ainda</h2><p>Ative o módulo fiscal em Dados fiscais para começar a emitir automaticamente.</p></div> : <section className="panel settings-table-wrap">
      <div className="settings-table-head">
        <span>Venda</span>
        <span>Nota</span>
        <span>Status</span>
        <span>Ações</span>
      </div>
      <div className="settings-table-body">
        {documents.map(doc => <article className="settings-row" key={doc.id}>
          <div className="settings-cell">
            <strong>{new Date(doc.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</strong>
            <small>{doc.saleChannel ? CHANNEL_LABELS[doc.saleChannel] ?? doc.saleChannel : ""}{doc.saleTotal !== undefined ? ` · ${money(doc.saleTotal)}` : ""}</small>
          </div>
          <div className="settings-cell">
            {doc.accessKey ? <><strong>Nº {doc.number}/{doc.series}</strong><small>{doc.accessKey}</small></> : <small>{doc.statusMessage ?? "—"}</small>}
          </div>
          <div className="settings-cell">
            <span className={`status-pill ${doc.status === "AUTHORIZED" ? "status-active" : doc.status === "PENDING" ? "status-warn" : "status-inactive"}`}>{STATUS_LABELS[doc.status]}{doc.environment === "HOMOLOGACAO" ? " (teste)" : ""}</span>
          </div>
          <div className="settings-cell">
            <div className="settings-actions">
              {doc.danfeUrl && <a className="secondary" href={doc.danfeUrl} target="_blank" rel="noreferrer">DANFE</a>}
              {(doc.status === "ERROR" || doc.status === "REJECTED") && <button type="button" className="secondary" disabled={retrying === doc.saleId} onClick={() => void retry(doc.saleId)}>{retrying === doc.saleId ? "Reemitindo…" : "Reemitir"}</button>}
              {doc.status === "AUTHORIZED" && <button type="button" className="secondary warn" onClick={() => setCancelTarget(doc)}>Cancelar</button>}
            </div>
          </div>
        </article>)}
      </div>
    </section>}
    {cancelTarget && <CancelFiscalDocumentModal document={cancelTarget} onClose={() => setCancelTarget(null)} onDone={() => { setCancelTarget(null); void load(); }} />}
  </section>;
}

function CancelFiscalDocumentModal({ document, onClose, onDone }: { document: FiscalDocument; onClose: () => void; onDone: () => void }) {
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/fiscal-documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CANCEL", saleId: document.saleId, justification: justification.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível cancelar.");
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cancelar."); } finally { setSaving(false); }
  };

  return <div className="modal-bg"><div className="modal">
    <button className="modal-close" onClick={onClose}><X /></button>
    <h2>Cancelar NFC-e</h2>
    <p>Nº {document.number}/{document.series}. A SEFAZ só aceita cancelamento em até 30 minutos da emissão.</p>
    {error && <div className="auth-error">{error}</div>}
    <label>Justificativa (mínimo 15 caracteres)<input value={justification} onChange={event => setJustification(event.target.value)} placeholder="Ex.: venda cancelada, cliente desistiu da compra" /></label>
    <button className="primary wide" disabled={saving || justification.trim().length < 15} onClick={() => void confirm()}>{saving ? "Cancelando…" : "Confirmar cancelamento"}</button>
  </div></div>;
}
