"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, X } from "lucide-react";
import { money } from "@/lib/domain";

export type DeliveryArea = { id: string; name: string; deliveryFee: number; neighborhoods: string | null; active: boolean };

export function DeliveryAreaSettings({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [neighborhoods, setNeighborhoods] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/delivery-areas", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as áreas de entrega.");
      setAreas(data.areas ?? []); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as áreas de entrega."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  const create = async () => {
    const parsedFee = Number(fee.replace(",", "."));
    if (name.trim().length < 2 || !Number.isFinite(parsedFee) || parsedFee < 0) { setError("Informe um nome e uma taxa válida."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/delivery-areas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), deliveryFee: parsedFee, neighborhoods: neighborhoods.trim() || undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a área de entrega.");
      setName(""); setFee(""); setNeighborhoods("");
      await load(); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a área de entrega."); } finally { setSaving(false); }
  };

  const toggleActive = async (area: DeliveryArea) => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/delivery-areas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ areaId: area.id, active: !area.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a área de entrega.");
      await load(); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a área de entrega."); } finally { setSaving(false); }
  };

  return <div className="modal-bg"><div className="modal" style={{ width: "min(560px,100%)" }}>
    <button className="modal-close" onClick={onClose}><X /></button>
    <span className="modal-icon"><MapPin /></span>
    <h2>Áreas de entrega</h2>
    <p>Cadastre bairros/zonas com uma taxa fixa para agilizar o pedido de delivery.</p>
    {error && <div className="auth-error">{error}</div>}
    <label className="field"><span>Nome da área</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Parque Aeroporto" /></label>
    <label className="field"><span>Taxa de entrega</span><input value={fee} onChange={event => setFee(event.target.value)} placeholder="0,00" inputMode="decimal" /></label>
    <label className="field"><span>Bairros atendidos (opcional)</span><input value={neighborhoods} onChange={event => setNeighborhoods(event.target.value)} placeholder="Ex.: Parque Aeroporto, Botafogo" /></label>
    <button className="primary wide" style={{ marginTop: 8 }} disabled={saving} onClick={() => void create()}><Plus /> Adicionar área</button>

    <div className="inventory-list" style={{ marginTop: 18 }}>
      {loading ? <div className="empty"><span>Carregando áreas…</span></div> : areas.length === 0 ? <div className="empty"><span>Nenhuma área de entrega cadastrada ainda.</span></div> : areas.map(area => <div key={area.id} className={`inventory-row ${!area.active ? "low" : ""}`} style={{ gridTemplateColumns: "1fr 120px auto" }}>
        <div><b>{area.name}</b>{area.neighborhoods && <small style={{ display: "block", color: "var(--muted)", fontSize: 9 }}>{area.neighborhoods}</small>}</div>
        <span>{money(area.deliveryFee)}</span>
        <div className="inventory-actions"><button type="button" className="secondary" disabled={saving} onClick={() => void toggleActive(area)}>{area.active ? "Inativar" : "Reativar"}</button></div>
      </div>)}
    </div>
  </div></div>;
}
