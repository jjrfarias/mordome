"use client";
import { useEffect, useState } from "react";
import { ImagePlus, Palette, RotateCcw } from "lucide-react";
import { compressImageFile } from "@/lib/image-compression";

type Branding = { logoUrl: string | null; primary: string; accent: string };
const defaults: Branding = { logoUrl: null, primary: "#173f35", accent: "#e97c4b" };

export function BrandingManagement({ onChanged }: { onChanged: () => Promise<void> }) {
  const [branding, setBranding] = useState<Branding>(defaults); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/admin/branding", { cache: "no-store" }).then(response => response.json()).then(data => data.branding && setBranding(data.branding)); }, []);
  async function chooseLogo(file?: File) { if (!file) return; setBusy(true); setMessage(""); try { const logoUrl = await compressImageFile(file); setBranding(current => ({ ...current, logoUrl })); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível processar a imagem."); } finally { setBusy(false); } }
  async function save() { setBusy(true); setMessage(""); const response = await fetch("/api/admin/branding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(branding) }); const data = await response.json(); if (response.ok) { setBranding(data.branding); setMessage("Identidade visual atualizada."); await onChanged(); } else setMessage(data.error); setBusy(false); }
  return <section className="panel branding-panel"><div className="section-title"><div><span className="section-kicker">Sua marca no Mordomê</span><h2>Identidade visual</h2><p>Personalize o ambiente da sua equipe. A assinatura Mordomê permanece visível em todas as telas.</p></div><Palette /></div>
    <div className="branding-editor"><div className="branding-logo-editor"><div className="branding-logo-preview">{branding.logoUrl ? <img src={branding.logoUrl} alt="Logo da organização"/> : <span>Sua logo</span>}</div><label className="secondary"><ImagePlus/>{busy ? "Processando…" : "Escolher logo"}<input type="file" accept="image/*" hidden disabled={busy} onChange={event => void chooseLogo(event.target.files?.[0])}/></label>{branding.logoUrl && <button className="secondary" onClick={() => setBranding(current => ({ ...current, logoUrl: null }))}>Remover</button>}</div>
      <div className="branding-colors"><label>Cor principal<div><input type="color" value={branding.primary} onChange={event => setBranding(current => ({ ...current, primary: event.target.value }))}/><input value={branding.primary} pattern="#[0-9a-fA-F]{6}" onChange={event => setBranding(current => ({ ...current, primary: event.target.value }))}/></div></label><label>Cor de destaque<div><input type="color" value={branding.accent} onChange={event => setBranding(current => ({ ...current, accent: event.target.value }))}/><input value={branding.accent} pattern="#[0-9a-fA-F]{6}" onChange={event => setBranding(current => ({ ...current, accent: event.target.value }))}/></div></label><div className="branding-actions"><button className="secondary" onClick={() => setBranding(defaults)}><RotateCcw/>Restaurar padrão</button><button className="primary" disabled={busy} onClick={() => void save()}>Salvar identidade</button></div></div>
      <div className="branding-preview" style={{ background: branding.primary }}><div>{branding.logoUrl && <img src={branding.logoUrl} alt=""/>}<strong>Sua empresa</strong></div><span>operando com</span><b>Mordomê</b><i style={{ background: branding.accent }}/></div></div>{message && <div className="inline-success">{message}</div>}
  </section>;
}
