"use client";

import { useEffect, useState } from "react";

type ProductFiscal = { id: string; name: string; category: string; ncm: string | null; cfop: string | null; icmsCst: string | null; icmsOrigin: string | null; unitOfMeasure: string | null };

// Dados fiscais por produto (ADR 0049): NCM/CFOP/CST-CSOSN/origem/unidade — exigidos pela SEFAZ
// para cada item de uma NFC-e. Produto sem esses dados continua vendendo normalmente em qualquer
// canal; só a emissão fiscal daquele item específico falha (com mensagem clara) até ser
// preenchido.
export function ProductFiscalManagement() {
  const [products, setProducts] = useState<ProductFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/product-fiscal", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os produtos.");
      setProducts(data.products ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os produtos."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Fiscal</span><h2>Dados fiscais dos produtos</h2></div></div>
      <p className="section-note">NCM, CFOP, CST/CSOSN, origem da mercadoria e unidade — preencha com o contador para garantir os códigos certos. Nenhum desses campos afeta preço, canais ou disponibilidade do produto.</p>
    </section>
    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty"><span>Carregando produtos…</span></div> : products.length === 0 ? <div className="empty small"><span>Nenhum produto cadastrado ainda.</span></div> : <section className="panel settings-table-wrap">
      <div className="settings-table-body">
        {products.map(product => <ProductFiscalRow key={product.id} product={product} editing={editingId === product.id} onEdit={() => setEditingId(product.id)} onCancel={() => setEditingId(null)} onSaved={async () => { setEditingId(null); await load(); }} />)}
      </div>
    </section>}
  </section>;
}

function ProductFiscalRow({ product, editing, onEdit, onCancel, onSaved }: { product: ProductFiscal; editing: boolean; onEdit: () => void; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ ncm: product.ncm ?? "", cfop: product.cfop ?? "", icmsCst: product.icmsCst ?? "", icmsOrigin: product.icmsOrigin ?? "", unitOfMeasure: product.unitOfMeasure ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/product-fiscal", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, ...form }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar.");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); } finally { setSaving(false); }
  };

  const complete = product.ncm && product.cfop && product.icmsCst && product.icmsOrigin && product.unitOfMeasure;

  return <article className="settings-row" style={{ gridTemplateColumns: editing ? "1fr" : "1fr auto auto" }}>
    {!editing ? <>
      <div className="settings-cell"><strong>{product.name}</strong><small>{product.category}{complete ? "" : " · dados fiscais incompletos"}</small></div>
      <div className="settings-cell">{product.ncm ? <span>NCM {product.ncm}{product.cfop ? ` · CFOP ${product.cfop}` : ""}</span> : <span className="status-pill status-warn">Sem dados fiscais</span>}</div>
      <div className="settings-cell"><div className="settings-actions"><button type="button" className="secondary" onClick={onEdit}>Editar</button></div></div>
    </> : <div>
      {error && <div className="auth-error">{error}</div>}
      <div className="settings-form" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <label className="field"><span>NCM</span><input value={form.ncm} onChange={event => setForm({ ...form, ncm: event.target.value })} placeholder="Ex.: 21069090" /></label>
        <label className="field"><span>CFOP</span><input value={form.cfop} onChange={event => setForm({ ...form, cfop: event.target.value })} placeholder="Ex.: 5102" /></label>
        <label className="field"><span>CST/CSOSN (ICMS)</span><input value={form.icmsCst} onChange={event => setForm({ ...form, icmsCst: event.target.value })} placeholder="Ex.: 102" /></label>
        <label className="field"><span>Origem</span><input value={form.icmsOrigin} onChange={event => setForm({ ...form, icmsOrigin: event.target.value })} placeholder="0 = nacional" /></label>
        <label className="field"><span>Unidade</span><input value={form.unitOfMeasure} onChange={event => setForm({ ...form, unitOfMeasure: event.target.value })} placeholder="Ex.: UN" /></label>
      </div>
      <div className="settings-actions" style={{ marginTop: 10 }}>
        <button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancelar</button>
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar"}</button>
      </div>
    </div>}
  </article>;
}
